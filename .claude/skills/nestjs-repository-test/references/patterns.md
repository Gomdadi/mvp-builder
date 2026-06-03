# TypeORM Repository Unit Test 패턴

## 1. 표준 beforeEach 셋업

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { Task } from '../entities/task.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';

// 서비스에서 실제로 사용하는 메서드만 선언
const mockTaskRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn(),   // 동기 메서드 — mockReturnValue
  save: jest.fn(),     // 비동기 메서드 — mockResolvedValue
  update: jest.fn(),
  count: jest.fn(),
};

const mockAnalysisDocumentRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('FeatureService', () => {
  let service: FeatureService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureService,
        // @InjectRepository(Task) 내부 토큰 = getRepositoryToken(Task)
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
        { provide: getRepositoryToken(AnalysisDocument), useValue: mockAnalysisDocumentRepo },
      ],
    }).compile();

    service = module.get<FeatureService>(FeatureService);
  });
```

---

## 2. create() + save() 패턴 테스트

```ts
  describe('create', () => {
    it('entity를 생성하고 저장한다', async () => {
      // create()는 동기 — mockReturnValue
      mockTaskRepo.create.mockReturnValue({ projectId: 'p-1', name: 'task-a' });
      // save()는 비동기 — mockResolvedValue
      mockTaskRepo.save.mockResolvedValue({ id: 'task-1', projectId: 'p-1', name: 'task-a' });

      const result = await service.createTask({ projectId: 'p-1', name: 'task-a' });

      expect(mockTaskRepo.create).toHaveBeenCalledWith({ projectId: 'p-1', name: 'task-a' });
      expect(mockTaskRepo.save).toHaveBeenCalledWith({ projectId: 'p-1', name: 'task-a' });
      expect(result).toEqual({ id: 'task-1', projectId: 'p-1', name: 'task-a' });
    });
  });
```

---

## 3. 배치 저장 검증 패턴 (createMany 대응)

```ts
  describe('createMany', () => {
    it('여러 태스크를 한 번에 저장한다', async () => {
      const tasks = [
        { name: 'Task A', orderIndex: 1 },
        { name: 'Task B', orderIndex: 2 },
      ];

      // create()는 호출될 때마다 동기적으로 같은 값 반환
      mockTaskRepo.create.mockImplementation((data) => data);
      mockTaskRepo.save.mockResolvedValue(tasks.map((t, i) => ({ id: `task-${i}`, ...t })));

      await service.createTasks(tasks);

      // save(array) 호출 검증
      expect(mockTaskRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Task A', orderIndex: 1 }),
          expect.objectContaining({ name: 'Task B', orderIndex: 2 }),
        ]),
      );
    });
  });
```

---

## 4. Not Found 케이스

```ts
    it('존재하지 않는 id면 NotFoundException을 던진다', async () => {
      // findOne → null → 서비스에서 NotFoundException throw
      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(service.findTask('unknown-id')).rejects.toThrow(NotFoundException);

      // 조회 실패 시 save 미호출 검증
      expect(mockTaskRepo.save).not.toHaveBeenCalled();
    });

    it('findOneOrFail 실패 시 EntityNotFoundError 전파', async () => {
      const { EntityNotFoundError } = await import('typeorm');
      mockTaskRepo.findOneOrFail.mockRejectedValue(new EntityNotFoundError('Task', {}));

      await expect(service.findTaskOrFail('unknown-id')).rejects.toThrow(EntityNotFoundError);
    });
```

---

## 5. update 호출 검증

```ts
    it('상태를 업데이트한다', async () => {
      mockTaskRepo.update.mockResolvedValue({ affected: 1 });

      await service.updateStatus('task-1', TaskStatus.DONE);

      expect(mockTaskRepo.update).toHaveBeenCalledWith(
        { id: 'task-1' },
        { status: TaskStatus.DONE },
      );
    });

    // update 호출 순서 검증 (상태 전이: IN_PROGRESS → DONE)
    it('RUNNING 후 DONE 순서로 상태를 업데이트한다', async () => {
      mockTaskRepo.update.mockResolvedValue({ affected: 1 });

      await service.processTask('task-1');

      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(1, { id: 'task-1' }, { status: TaskStatus.IN_PROGRESS });
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-1' }, { status: TaskStatus.DONE });
    });
```

---

## 6. 외부 API 실패 시 DB 저장 미호출 검증

```ts
    it('API 실패 시 task를 저장하지 않는다', async () => {
      mockExternalService.call.mockRejectedValue(new Error('API Error'));

      await expect(service.processAndSave('p-1')).rejects.toThrow('API Error');

      expect(mockTaskRepo.save).not.toHaveBeenCalled();
    });
```
