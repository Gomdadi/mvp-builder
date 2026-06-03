# NestJS Service 구현 패턴

## 1. 기본 Service 골격 (Repository 주입)

```ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Task } from '../entities/task.entity';
import { Project } from '../entities/project.entity';
import { QUEUE_NAME } from './feature.constants';

@Injectable()
export class FeatureService {
  constructor(
    // @InjectRepository: TypeOrmModule.forFeature()에 등록된 엔티티의 Repository를 DI로 주입
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectQueue(QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async findTask(id: string) {
    // HTTP 경계에서는 findOne + null 체크 + NotFoundException 패턴
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('TASK_NOT_FOUND');
    return task;
  }

  async findTaskOrFail(id: string) {
    // 내부 서비스 로직에서는 findOneOrFail 사용 (EntityNotFoundError 자동 발생)
    return this.taskRepo.findOneOrFail({ where: { id } });
  }

  async create(data: { projectId: string; name: string }) {
    // 중복 체크
    const existing = await this.taskRepo.findOne({
      where: { projectId: data.projectId, name: data.name },
    });
    if (existing) throw new ConflictException('TASK_ALREADY_EXISTS');

    // create(): 인스턴스 생성(DB 저장 안 함) → save(): DB INSERT
    const task = await this.taskRepo.save(this.taskRepo.create(data));

    await this.queue.add('PROCESS', { taskId: task.id });

    return { id: task.id, name: task.name };
  }
}
```

---

## 2. 배치 저장 패턴 (Prisma createMany 대응)

```ts
async createMany(projectId: string, items: { name: string; orderIndex: number }[]) {
  // save(array): 여러 인스턴스를 한 번에 INSERT
  return this.taskRepo.save(
    items.map(item => this.taskRepo.create({ projectId, ...item })),
  );
}
```

---

## 3. 부분 업데이트 패턴

```ts
async updateStatus(id: string, status: TaskStatus) {
  // update(criteria, partialEntity): 특정 필드만 업데이트, 엔티티 전체 로딩 불필요
  // 반환값: UpdateResult (affected count) — 업데이트된 엔티티가 필요하면 별도 조회
  await this.taskRepo.update({ id }, { status });
}

// 조건이 여러 개인 업데이트
async failAllByProject(projectId: string) {
  await this.taskRepo.update(
    { projectId, status: TaskStatus.IN_PROGRESS },
    { status: TaskStatus.FAILED },
  );
}
```

---

## 4. 정렬 조회 패턴

```ts
async findLatestDocument(projectId: string) {
  // Prisma findFirst({ orderBy }) 대응 → TypeORM findOne({ order })
  return this.analysisDocumentRepo.findOne({
    where: { projectId, isConfirmed: true },
    order: { version: 'DESC' },
  });
}
```

---

## 5. NestJS 예외 처리 패턴

```ts
import {
  NotFoundException,       // 404 - 리소스 없음
  ConflictException,       // 409 - 중복/충돌
  BadRequestException,     // 400 - 잘못된 입력
  ForbiddenException,      // 403 - 권한 없음
  UnauthorizedException,   // 401 - 인증 없음
} from '@nestjs/common';

// HTTP 경계 조회 패턴
async findOrFail(id: string) {
  const entity = await this.repo.findOne({ where: { id } });
  if (!entity) throw new NotFoundException('ENTITY_NOT_FOUND');
  return entity;
}

// 내부 로직 조회 (EntityNotFoundError 자동 발생)
async findInternal(id: string) {
  return this.repo.findOneOrFail({ where: { id } });
}
```

---

## 6. Queue 없는 순수 Service 패턴

```ts
@Injectable()
export class SimpleService {
  constructor(
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
  ) {}

  async findAll(projectId: string) {
    return this.taskRepo.find({
      where: { projectId },
      order: { orderIndex: 'ASC' },
    });
  }

  async delete(id: string, userId: string) {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('NOT_FOUND');
    if (task.projectId !== userId) throw new ForbiddenException('FORBIDDEN');

    await this.taskRepo.update({ id }, { status: TaskStatus.FAILED });
  }
}
```
