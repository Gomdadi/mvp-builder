import { Inject, Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import Redis from 'ioredis';
import { SSE_REDIS_PUB, SSE_REDIS_SUB } from './sse.constants';
import { SseEvent } from './sse.types';

// SSE 실시간 스트리밍 서비스.
//
// 동작 흐름:
//   1. Worker가 이벤트 발생 시 publish(projectId, event)를 호출 → Redis PUBLISH sse:{projectId}
//   2. SUBSCRIBE 전용 커넥션(sub)이 해당 채널 메시지를 수신 → 채널명으로 Subject 조회 후 next()
//   3. 클라이언트가 getStream(projectId)로 받은 Observable로 이벤트가 흐른다
//
// Redis pub/sub을 쓰는 이유: 단일 인스턴스라면 in-process Subject로 충분하지만,
// 수평 확장(여러 백엔드 인스턴스) 시 Worker와 SSE 핸들러가 다른 프로세스일 수 있어 Redis를 브로커로 둔다.
@Injectable()
export class SseService {
  // projectId별 Subject — SUBSCRIBE 커넥션에서 받은 메시지를 Observable로 변환하는 브릿지.
  // 클라이언트 연결마다 동일 projectId면 같은 Subject를 공유한다.
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  constructor(
    // SSE_REDIS_PUB: PUBLISH 전용 커넥션 (다른 명령도 가능하지만 여기선 publish만 사용)
    @Inject(SSE_REDIS_PUB) private readonly pub: Redis,
    // SSE_REDIS_SUB: SUBSCRIBE 전용 커넥션 (subscribe 모드에서는 publish 등 다른 명령 불가)
    @Inject(SSE_REDIS_SUB) private readonly sub: Redis,
  ) {
    // 모든 채널의 메시지를 한 핸들러에서 중앙 수신한다.
    // 채널명(sse:{projectId})에서 projectId를 복원해 해당 Subject로 이벤트를 흘려보낸다.
    this.sub.on('message', (channel: string, message: string) => {
      const projectId = channel.replace('sse:', '');
      const subject = this.subjects.get(projectId);
      // 구독자가 없는(이미 complete된) 채널 메시지는 무시
      subject?.next({ data: JSON.parse(message) as SseEvent });
    });
  }

  // Worker에서 이벤트 발생 시 호출 — Redis로 PUBLISH한다.
  // PUBLISH는 Promise를 반환하므로 await로 전송 완료를 보장한다.
  async publish(projectId: string, event: SseEvent): Promise<void> {
    await this.pub.publish(`sse:${projectId}`, JSON.stringify(event));
  }

  // 클라이언트 SSE 연결 시 호출 — Subject를 생성(최초 1회)하고 Redis SUBSCRIBE 후 Observable을 반환한다.
  // 같은 projectId로 재호출 시 기존 Subject를 재사용해 중복 SUBSCRIBE를 방지한다.
  getStream(projectId: string): Observable<MessageEvent> {
    if (!this.subjects.has(projectId)) {
      this.subjects.set(projectId, new Subject<MessageEvent>());
      // 해당 projectId 채널을 SUBSCRIBE — 이후 publish된 메시지가 위 on('message')로 들어온다
      this.sub.subscribe(`sse:${projectId}`);
    }
    return this.subjects.get(projectId)!.asObservable();
  }

  // pipeline_completed / pipeline_failed 이후 호출 — 스트림을 종료하고 구독을 해제한다.
  // subject.complete()로 클라이언트 SSE 연결이 정상 종료되며, UNSUBSCRIBE로 Redis 구독을 정리한다.
  // UNSUBSCRIBE는 Promise를 반환하므로 await한다.
  async complete(projectId: string): Promise<void> {
    const subject = this.subjects.get(projectId);
    if (subject) {
      subject.complete(); // Observable 종료 → 클라이언트 스트림 닫힘
      this.subjects.delete(projectId);
      await this.sub.unsubscribe(`sse:${projectId}`);
    }
  }
}
