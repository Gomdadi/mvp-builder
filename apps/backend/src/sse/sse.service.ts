import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SseEvent } from './sse.types';

// SSE 실시간 스트리밍 서비스.
//
// 동작 흐름:
//   1. Worker가 이벤트 발생 시 publish(projectId, event)를 호출 → 해당 Subject에 직접 next()
//   2. 클라이언트가 getStream(projectId)로 받은 Observable로 이벤트가 흐른다
//
// in-process Subject 방식을 사용하는 이유:
//   Redis pub/sub 경로(pub.publish → sub.on('message') → next())는 이벤트 루프 타이밍상
//   publish() 직후 complete()를 호출하면 클라이언트가 이벤트를 받지 못하는 race condition이 발생한다.
//   현재 단일 인스턴스 환경에서는 in-process Subject로 충분하며, race condition이 없다.
@Injectable()
export class SseService {
  // projectId별 Subject — publish() 호출 시 직접 next()로 이벤트를 흘려보내는 브릿지.
  // 클라이언트 연결마다 동일 projectId면 같은 Subject를 공유한다.
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  // Worker에서 이벤트 발생 시 호출 — Subject에 직접 next()로 즉시 전달.
  // complete() 이전에 반드시 subject에 도달하므로 race condition 없음
  async publish(projectId: string, event: SseEvent): Promise<void> {
    const subject = this.subjects.get(projectId);
    subject?.next({ data: event });
  }

  // 클라이언트 SSE 연결 시 호출 — Subject를 생성(최초 1회)하고 Observable을 반환한다.
  // 같은 projectId로 재호출 시 기존 Subject를 재사용한다.
  getStream(projectId: string): Observable<MessageEvent> {
    if (!this.subjects.has(projectId)) {
      this.subjects.set(projectId, new Subject<MessageEvent>());
    }
    return this.subjects.get(projectId)!.asObservable();
  }

  // pipeline_completed / pipeline_failed 이후 호출 — 스트림을 종료하고 Subject를 정리한다.
  // subject.complete()로 클라이언트 SSE 연결이 정상 종료된다.
  async complete(projectId: string): Promise<void> {
    const subject = this.subjects.get(projectId);
    if (subject) {
      subject.complete();
      this.subjects.delete(projectId);
    }
  }
}
