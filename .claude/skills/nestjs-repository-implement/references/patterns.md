# TypeORM Repository 구현 패턴

## 1. 기본 Repository 주입 골격

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../entities/enums';

@Injectable()
export class TaskService {
  constructor(
    // @InjectRepository: TypeOrmModule.forFeature()에 등록된 엔티티의 Repository를 DI로 주입
    // Repository<T>: TypeORM 기본 저장소 클래스 — findOne, save, update 등 CRUD 메서드 제공
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
  ) {}
}
```

## 2. 조회 패턴

```typescript
// 단건 조회 — 없으면 null 반환 (HTTP 경계에서 사용)
async findOne(id: string) {
  const task = await this.taskRepo.findOne({ where: { id } });
  if (!task) throw new NotFoundException('TASK_NOT_FOUND');
  return task;
}

// 단건 조회 — 없으면 EntityNotFoundError 자동 발생 (내부 서비스 로직에서 사용)
async findOrFail(id: string) {
  return this.taskRepo.findOneOrFail({ where: { id } });
}

// 정렬 + 조건 조회 (Prisma의 findFirst({ where, orderBy })에 대응)
async findLatestConfirmed(projectId: string) {
  return this.taskRepo.findOne({
    where: { projectId, isConfirmed: true },
    order: { version: 'DESC' }, // Prisma orderBy: { version: 'desc' }
  });
}

// 목록 조회
async findAll(projectId: string) {
  return this.taskRepo.find({
    where: { projectId },
    order: { orderIndex: 'ASC' },
  });
}
```

## 3. 저장 패턴

```typescript
// 신규 엔티티 저장
// create(): 엔티티 인스턴스만 생성 (DB 저장 안 함)
// save(): DB에 INSERT하고 저장된 엔티티(자동 생성 id, createdAt 등 포함) 반환
async create(data: { projectId: string; name: string; orderIndex: number }) {
  return this.taskRepo.save(
    this.taskRepo.create(data),
  );
}

// 배치 저장 — Prisma의 createMany에 대응
// save(array): 여러 인스턴스를 한 번의 쿼리로 INSERT
async createMany(items: { projectId: string; name: string; orderIndex: number }[]) {
  return this.taskRepo.save(
    items.map(item => this.taskRepo.create(item)),
  );
}
```

## 4. 업데이트 패턴

```typescript
// 특정 필드만 업데이트 — 엔티티 전체 로딩 없이 효율적
// update(criteria, partialEntity): WHERE criteria에 맞는 행의 partialEntity 필드만 변경
// 반환값: UpdateResult — 저장된 엔티티가 아니므로 업데이트 후 엔티티가 필요하면 별도로 조회
async updateStatus(id: string, status: TaskStatus) {
  await this.taskRepo.update({ id }, { status });
}

// 조건이 여러 개인 업데이트
async completeAllByPipeline(pipelineRunId: string) {
  await this.taskRepo.update(
    { pipelineRunId, status: TaskStatus.IN_PROGRESS },
    { status: TaskStatus.DONE },
  );
}
```

## 5. 카운트 패턴

```typescript
// count: 조건에 맞는 행 수 반환
async countByProject(projectId: string) {
  return this.taskRepo.count({ where: { projectId } });
}
```

## 6. 모듈 등록 예시

Repository를 주입받으려면 해당 서비스가 속한 모듈에 `TypeOrmModule.forFeature()` 등록 필요:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../entities/task.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { TaskService } from './task.service';

@Module({
  // forFeature: 이 모듈에서 사용할 엔티티의 Repository를 DI에 등록
  // 여기 없는 엔티티의 @InjectRepository는 런타임 에러 발생
  imports: [TypeOrmModule.forFeature([Task, AnalysisDocument])],
  providers: [TaskService],
})
export class TaskModule {}
```

## 7. Prisma → TypeORM 메서드 대응표

| Prisma | TypeORM |
|--------|---------|
| `prisma.task.findUnique({ where })` | `repo.findOne({ where })` |
| `prisma.task.findUniqueOrThrow({ where })` | `repo.findOneOrFail({ where })` |
| `prisma.task.findFirst({ where, orderBy })` | `repo.findOne({ where, order })` |
| `prisma.task.create({ data })` | `repo.save(repo.create(data))` |
| `prisma.task.createMany({ data })` | `repo.save(array)` |
| `prisma.task.update({ where, data })` | `repo.update(where, partialData)` |
| `prisma.task.count({ where })` | `repo.count({ where })` |
