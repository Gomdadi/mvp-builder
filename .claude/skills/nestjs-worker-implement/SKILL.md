---
name: nestjs-worker-implement
description: "NestJS BullMQ Worker(*.worker.ts)를 작성한다. @Processor 데코레이터, WorkerHost 상속, Job 핸들러 분기, TypeORM Repository 상태 추적이 필요할 때 사용한다. 키워드: worker 구현, BullMQ, @Processor, WorkerHost, Job 처리, 비동기 큐, @InjectRepository"
---

# NestJS BullMQ Worker 구현

## 트리거
- `*.worker.ts` 신규 작성
- 비동기 큐 Job 처리 로직 구현
- `@Processor` 기반 핸들러 추가

## 구현 워크플로우

1. **클래스 선언**
   - `@Processor(QUEUE_NAME)` 데코레이터
   - `extends WorkerHost` 상속
   - `@Injectable()` 불필요 (`@Processor`가 포함)
   - `private readonly logger = new Logger(XxxWorker.name)` 선언

2. **Constructor DI 선언**
   - DB 접근 필요 시: `@InjectRepository(Entity) private readonly repo: Repository<Entity>`
   - 비즈니스 로직 서비스: `private readonly service: XxxService`

3. **`process()` 메서드 구현** — 진입점, job.name으로 분기
   ```ts
   async process(job: Job): Promise<void> {
     switch (job.name) {
       case JobName.TASK_A: return this.handleTaskA(job);
       case JobName.TASK_B: return this.handleTaskB(job);
       default: throw new Error(`Unknown job: ${job.name}`);
     }
   }
   ```

4. **핸들러 메서드 분리** — `private async handle*(job: Job)`
   - job.data에서 필요한 값 추출
   - DB 상태 `IN_PROGRESS` → 비즈니스 로직 실행 → `DONE`
   - catch에서 `FAILED` 갱신 후 예외 re-throw (BullMQ retry 트리거)
   - DB 상태 업데이트: `repo.update({ id }, { status })` 패턴 (엔티티 전체 로딩 불필요)

5. **에러 처리** — 예외를 삼키지 말고 re-throw
   - BullMQ는 예외 발생 시 설정에 따라 자동 retry
   - 최종 실패 시 DB 상태 `FAILED` 기록

## 체크리스트

- [ ] `@Processor(QUEUE_NAME)` + `extends WorkerHost`
- [ ] DB 접근 시 `@InjectRepository(Entity)` 데코레이터 + `Repository<Entity>` 타입
- [ ] `process()` switch-case로 job.name 분기
- [ ] 알 수 없는 job.name은 예외 throw
- [ ] 각 핸들러는 `private async handle*()` 별도 메서드
- [ ] DB 상태 추적: `repo.update({ id }, { status })` 패턴
- [ ] catch 블록에서 FAILED 상태 저장 후 예외 re-throw
- [ ] `Logger` 인스턴스 선언 및 핵심 단계 logging

## 패턴 참조

→ `references/patterns.md`
