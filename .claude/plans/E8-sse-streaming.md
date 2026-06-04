# E8 SSE 실시간 스트리밍 구현 플랜

## Context

파이프라인(Phase 1→2→3→4)은 BullMQ Worker에서 비동기로 실행된다.  
클라이언트는 요청 후 202를 받고 파이프라인이 언제 완료되는지 알 수 없다.  
`GET /v1/pipeline/:projectId/stream` SSE 엔드포인트를 통해 phase 시작/완료, 태스크 진행, GitHub URL을 실시간으로 전달한다.

---

## 아키텍처 결정: Redis Pub/Sub

Worker가 이벤트 발생 시 Redis에 PUBLISH → SSE 핸들러가 SUBSCRIBE해서 클라이언트로 전달.  
단일 인스턴스에서는 in-process Subject로도 충분하지만, Redis pub/sub 패턴 학습 및 수평 확장 대비를 위해 이 방식을 선택한다.

```
PipelineWorker / TaskWorker
        │
        │ sseService.publish(projectId, event)
        │       → Redis PUBLISH sse:{projectId} '{"type":"phase_completed",...}'
        ↓
    Redis
        │
        │ (SUBSCRIBE sse:{projectId})
        ↓
    SseService (subscriber connection)
        │ sub.on('message') → subject.next(event)
        ↓
    Observable<MessageEvent>
        │
        ↓
    클라이언트 (SSE 스트림)
```

**Redis 연결 구조:**
- `SSE_REDIS_PUB`: 일반 ioredis 연결 — PUBLISH 전용 (get/set 등 다른 명령도 가능)
- `SSE_REDIS_SUB`: SUBSCRIBE 전용 ioredis 연결 — subscribe 모드 진입 시 다른 명령 불가, 전용 연결 필요

---

## 이벤트 목록

```typescript
type SseEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'task_started'
  | 'task_completed'
  | 'pipeline_completed'
  | 'pipeline_failed';

interface SseEvent {
  type: SseEventType;
  phase?: string;          // PipelinePhase enum 값
  taskId?: string;
  taskName?: string;
  githubRepoUrl?: string;  // pipeline_completed 시
  message?: string;        // pipeline_failed 시 에러 메시지
  timestamp: string;       // ISO 8601
}
```

Redis 채널명: `sse:{projectId}` (프로젝트별 채널 분리)

---

## 신규 파일

### `src/sse/sse.types.ts`
- `SseEventType` union type
- `SseEvent` interface

### `src/sse/sse.service.ts`
```typescript
@Injectable()
export class SseService {
  // projectId별 Subject — subscriber connection에서 받은 메시지를 Observable로 변환하는 브릿지
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  constructor(
    @Inject(SSE_REDIS_PUB) private readonly pub: Redis,  // PUBLISH 전용
    @Inject(SSE_REDIS_SUB) private readonly sub: Redis,  // SUBSCRIBE 전용
  ) {
    // 모든 채널의 메시지를 중앙에서 수신 — 채널명으로 해당 Subject 조회
    this.sub.on('message', (channel: string, message: string) => {
      const projectId = channel.replace('sse:', '');
      const subject = this.subjects.get(projectId);
      subject?.next({ data: JSON.parse(message) });
    });
  }

  // Worker에서 이벤트 발생 시 호출 — Redis PUBLISH
  async publish(projectId: string, event: SseEvent): Promise<void> {
    await this.pub.publish(`sse:${projectId}`, JSON.stringify(event));
  }

  // Client 연결 시 호출 — Subject 생성 + Redis SUBSCRIBE + Observable 반환
  getStream(projectId: string): Observable<MessageEvent> {
    if (!this.subjects.has(projectId)) {
      this.subjects.set(projectId, new Subject<MessageEvent>());
      this.sub.subscribe(`sse:${projectId}`);
    }
    return this.subjects.get(projectId)!.asObservable();
  }

  // pipeline_completed / pipeline_failed 이후 호출 — 스트림 종료 + 구독 해제
  async complete(projectId: string): Promise<void> {
    const subject = this.subjects.get(projectId);
    if (subject) {
      subject.complete();
      this.subjects.delete(projectId);
      await this.sub.unsubscribe(`sse:${projectId}`);
    }
  }
}
```

### `src/sse/sse.controller.ts`
```typescript
@Controller('v1/pipeline')
export class SseController {
  @Sse(':projectId/stream')
  stream(@Param('projectId') projectId: string): Observable<MessageEvent> {
    return this.sseService.getStream(projectId);
  }
}
```

### `src/sse/sse.module.ts`
```typescript
@Module({
  providers: [
    // PUBLISH 전용 ioredis 연결
    { provide: SSE_REDIS_PUB, useFactory: (config: ConfigService) => new Redis({ host: ..., port: ... }), inject: [ConfigService] },
    // SUBSCRIBE 전용 ioredis 연결
    { provide: SSE_REDIS_SUB, useFactory: (config: ConfigService) => new Redis({ host: ..., port: ... }), inject: [ConfigService] },
    SseService,
  ],
  controllers: [SseController],
  exports: [SseService],  // PipelineModule의 Worker가 publish() 호출하기 위해
})
export class SseModule {}
```

### `src/sse/sse.constants.ts`
- `SSE_REDIS_PUB = 'SSE_REDIS_PUB'`
- `SSE_REDIS_SUB = 'SSE_REDIS_SUB'`

---

## 수정 파일

### `src/pipeline/pipeline.module.ts`
- `SseModule` import 추가

### `src/pipeline/pipeline.worker.ts`
생성자에 `SseService` 주입. 각 핸들러에 emit 추가:

| 위치 | 호출 |
|---|---|
| handleStart: phase1.run 직전 | `publish(projectId, { type: 'phase_started', phase: 'PHASE_1' })` |
| handleStart: DB 업데이트 직후 (line 74-76) | `publish(...)` phase_completed + `complete()` |
| handleStart: catch (line 79) | `publish(...)` pipeline_failed + `complete()` |
| handleFeedback | handleStart와 동일 패턴 |
| handleConfirm: phase2.run 직전 | `publish(...)` phase_started PHASE_2 |
| handleConfirm: DB status PHASE_3 후 (line 134) | `publish(...)` phase_completed PHASE_2 → phase_started PHASE_3 |
| handleConfirm: catch (line 150) | `publish(...)` pipeline_failed + `complete()` |
| handleSandbox: phase4.run 직전 (line 172) | `publish(...)` phase_started PHASE_4 |
| handleSandbox: githubRepoUrl 저장 후 (line 182-184) | `publish(...)` pipeline_completed + `complete()` |
| handleSandbox: catch (line 187) | `publish(...)` pipeline_failed + `complete()` |

### `src/pipeline/task.worker.ts`
생성자에 `SseService` 주입.  
`handleRun()`: phase3.run 전 `task_started`, 성공 후 `task_completed`  
→ `complete()`는 여기서 호출하지 않음 (pipeline 종료는 PipelineWorker가 담당)

---

## 테스트 파일

### `src/sse/sse.service.spec.ts`
- `publish()`: Redis pub mock에 PUBLISH 호출 확인
- `getStream()`: Subject 생성 + Redis SUBSCRIBE 호출 확인, 같은 projectId 재호출 시 중복 SUBSCRIBE 없음
- `complete()`: subject.complete() + Redis UNSUBSCRIBE 호출 확인
- `sub.on('message')` 수신 시 Subject에 next() 전달 통합 케이스

---

## 검증 방법

1. 인프라 기동: `docker compose up -d`
2. 백엔드 기동: `cd apps/backend && npm run dev`
3. SSE 스트림 연결:
   ```bash
   curl -N http://localhost:3001/v1/pipeline/{projectId}/stream
   ```
4. 별도 터미널에서 파이프라인 시작 (세션 ID 필요):
   ```bash
   curl -X POST http://localhost:3001/v1/pipeline/{projectId}/start \
     -H "X-Session-Id: {sessionId}"
   ```
5. SSE 출력 순서 확인:
   ```
   data: {"type":"phase_started","phase":"PHASE_1","timestamp":"..."}
   data: {"type":"phase_completed","phase":"PHASE_1","timestamp":"..."}
   ...
   data: {"type":"pipeline_completed","githubRepoUrl":"https://github.com/..."}
   ```
6. `pipeline_completed` 수신 후 스트림 자동 종료 확인
7. 테스트: `npx jest src/sse/sse.service.spec.ts`

---

## 의존성 추가 없음
- `ioredis`: 이미 설치됨 (`session.module.ts`에서 동일하게 사용 중)
- RxJS: NestJS에 포함
- `@Sse`, `MessageEvent`: `@nestjs/common` 내장
