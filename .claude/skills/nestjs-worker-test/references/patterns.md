# NestJS Worker Unit Test 패턴

## 1. Worker 기본 test 골격

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { FeatureWorker } from './feature.worker';
import { FeatureService } from './feature.service';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../entities/enums';
import { FeatureJobName } from './feature.constants';

const mockFeatureService = { doWork: jest.fn(), cleanup: jest.fn() };
const mockTaskRepo = {
  update: jest.fn(),
};

const makeJob = (name: string, data: object) => ({ name, data }) as Job;

describe('FeatureWorker', () => {
  let worker: FeatureWorker;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureWorker,
        { provide: FeatureService, useValue: mockFeatureService },
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
      ],
    }).compile();

    worker = module.get<FeatureWorker>(FeatureWorker);
  });
```

---

## 2. Happy Path 테스트 (상태 전이 검증)

```ts
  describe('process - PROCESS job', () => {
    it('IN_PROGRESS → DONE 순서로 상태를 업데이트한다', async () => {
      mockTaskRepo.update.mockResolvedValue({ affected: 1 });
      mockFeatureService.doWork.mockResolvedValue(undefined);

      await worker.process(makeJob(FeatureJobName.PROCESS, { taskId: 'task-1' }));

      expect(mockTaskRepo.update).toHaveBeenCalledTimes(2);
      // nthCalledWith로 호출 순서까지 검증
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(1,
        { id: 'task-1' },
        { status: TaskStatus.IN_PROGRESS },
      );
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2,
        { id: 'task-1' },
        { status: TaskStatus.DONE },
      );
    });
  });
```

---

## 3. 실패 케이스 (FAILED 상태 + 예외 re-throw)

```ts
    it('doWork 실패 시 FAILED 상태로 업데이트하고 예외를 re-throw한다', async () => {
      mockTaskRepo.update.mockResolvedValue({ affected: 1 });
      mockFeatureService.doWork.mockRejectedValue(new Error('Service Error'));

      await expect(
        worker.process(makeJob(FeatureJobName.PROCESS, { taskId: 'task-1' })),
      ).rejects.toThrow('Service Error');

      expect(mockTaskRepo.update).toHaveBeenCalledWith(
        { id: 'task-1' },
        { status: TaskStatus.FAILED },
      );
    });
```

---

## 4. 알 수 없는 Job 이름 검증

```ts
  it('알 수 없는 job name이면 예외를 던진다', async () => {
    await expect(
      worker.process(makeJob('UNKNOWN_JOB', {})),
    ).rejects.toThrow('Unknown job name: UNKNOWN_JOB');
  });
```

---

## 5. 상태 추적 없는 단순 Worker 테스트

```ts
  it('service.handle을 job.data로 호출한다', async () => {
    mockFeatureService.handle = jest.fn().mockResolvedValue(undefined);
    const jobData = { key: 'value' };

    await worker.process(makeJob('HANDLE', jobData));

    expect(mockFeatureService.handle).toHaveBeenCalledWith(jobData);
  });
```
