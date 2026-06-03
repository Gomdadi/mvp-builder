# NestJS BullMQ Worker 구현 패턴

## 1. Worker 기본 골격

```ts
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../entities/enums';
import { FeatureService } from './feature.service';
import { FEATURE_QUEUE, FeatureJobName } from './feature.constants';

@Processor(FEATURE_QUEUE)
export class FeatureWorker extends WorkerHost {
  private readonly logger = new Logger(FeatureWorker.name);

  constructor(
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    private readonly featureService: FeatureService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case FeatureJobName.PROCESS:
        return this.handleProcess(job);
      case FeatureJobName.CLEANUP:
        return this.handleCleanup(job);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleProcess(job: Job): Promise<void> {
    const { taskId } = job.data as { taskId: string };
    this.logger.log(`Processing task ${taskId}`);

    // 상태 IN_PROGRESS 갱신 (엔티티 전체 로딩 없이 특정 필드만)
    await this.taskRepo.update({ id: taskId }, { status: TaskStatus.IN_PROGRESS });

    try {
      await this.featureService.doWork(taskId);

      await this.taskRepo.update({ id: taskId }, { status: TaskStatus.DONE });
    } catch (err) {
      await this.taskRepo.update({ id: taskId }, { status: TaskStatus.FAILED });
      throw err; // BullMQ retry 트리거
    }
  }

  private async handleCleanup(job: Job): Promise<void> {
    const { taskId } = job.data as { taskId: string };
    await this.featureService.cleanup(taskId);
  }
}
```

---

## 2. constants 파일 (Queue 이름 + Job 이름 상수화)

```ts
// feature.constants.ts
export const FEATURE_QUEUE = 'feature-queue';

export enum FeatureJobName {
  PROCESS = 'PROCESS',
  CLEANUP = 'CLEANUP',
}
```

---

## 3. 상태 추적 없는 단순 Worker

```ts
@Processor(SIMPLE_QUEUE)
export class SimpleWorker extends WorkerHost {
  constructor(private readonly service: SimpleService) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.service.handle(job.data);
  }
}
```

---

## 4. BullMQ retry 설정 (Queue add 시)

```ts
await this.queue.add('PROCESS', { taskId }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
});
```
