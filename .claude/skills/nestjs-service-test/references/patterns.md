# NestJS Service Unit Test 패턴

## 1. 표준 beforeEach 셋업

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { FeatureService } from './feature.service';
import { Task } from '../entities/task.entity';
import { Project } from '../entities/project.entity';
import { QUEUE_NAME } from './feature.constants';

const mockTaskRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),   // 동기 — mockReturnValue
  save: jest.fn(),     // 비동기 — mockResolvedValue
  update: jest.fn(),
  count: jest.fn(),
};

const mockProjectRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockQueue = { add: jest.fn() };

describe('FeatureService', () => {
  let service: FeatureService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureService,
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
        { provide: getQueueToken(QUEUE_NAME), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FeatureService>(FeatureService);
  });
```

---

## 2. Happy Path 테스트 (create + save 패턴)

```ts
  describe('create', () => {
    it('task를 생성하고 큐에 job을 추가한다', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);
      // create()는 동기 — mockReturnValue
      mockTaskRepo.create.mockReturnValue({ projectId: 'p-1', name: 'Test' });
      // save()는 비동기 — mockResolvedValue
      mockTaskRepo.save.mockResolvedValue({ id: 'task-1', projectId: 'p-1', name: 'Test' });

      const result = await service.create({ name: 'Test', projectId: 'p-1' });

      expect(mockTaskRepo.create).toHaveBeenCalledWith({ name: 'Test', projectId: 'p-1' });
      expect(mockTaskRepo.save).toHaveBeenCalledWith({ projectId: 'p-1', name: 'Test' });
      expect(mockQueue.add).toHaveBeenCalledWith('PROCESS', { taskId: 'task-1' });
      expect(result).toEqual({ id: 'task-1', name: 'Test' });
    });
  });
```

---

## 3. Not Found / 중복 에러 케이스

```ts
    it('중복 이름이면 ConflictException을 던진다', async () => {
      mockTaskRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ name: 'Test', projectId: 'p-1' }),
      ).rejects.toThrow(ConflictException);

      expect(mockTaskRepo.save).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('존재하지 않는 id면 NotFoundException을 던진다', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(service.findTask('unknown')).rejects.toThrow(NotFoundException);
    });
```

---

## 4. DB 저장 검증 패턴

```ts
    it('올바른 데이터로 DB에 저장한다', async () => {
      mockTaskRepo.create.mockReturnValue({ name: 'Test', projectId: 'p-1' });
      mockTaskRepo.save.mockResolvedValue({ id: 'task-1' });

      await service.create({ name: 'Test', projectId: 'p-1' });

      expect(mockTaskRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTaskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test' }),
      );
    });
```

---

## 5. 배치 저장 검증

```ts
    it('여러 태스크를 배치 저장한다', async () => {
      mockTaskRepo.create.mockImplementation((data) => data);
      mockTaskRepo.save.mockResolvedValue([]);

      await service.createMany('p-1', [
        { name: 'Task A', orderIndex: 1 },
        { name: 'Task B', orderIndex: 2 },
      ]);

      expect(mockTaskRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Task A', orderIndex: 1 }),
          expect.objectContaining({ name: 'Task B', orderIndex: 2 }),
        ]),
      );
    });
```

---

## 6. update 호출 검증

```ts
    it('update로 상태를 변경한다', async () => {
      mockTaskRepo.update.mockResolvedValue({ affected: 1 });

      await service.updateStatus('task-1', TaskStatus.DONE);

      expect(mockTaskRepo.update).toHaveBeenCalledWith(
        { id: 'task-1' },
        { status: TaskStatus.DONE },
      );
    });
```
