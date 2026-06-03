---
name: nestjs-repository-implement
description: "TypeORM Repository를 서비스에 주입해 DB 접근 코드를 작성한다. @InjectRepository, create/save, findOne/findOneOrFail, update, count 패턴이 필요할 때 사용한다. 키워드: repository 구현, TypeORM, @InjectRepository, Repository<T>, save, findOneOrFail, 엔티티"
---

# TypeORM Repository 구현

## 트리거
- 서비스에서 DB 접근이 필요한 메서드 작성
- `@InjectRepository` 기반 의존성 주입 선언
- Entity CRUD 구현 (조회/저장/업데이트/카운트)

## 구현 워크플로우

1. **모듈 등록 확인** — 서비스가 속한 모듈의 `imports`에 `TypeOrmModule.forFeature([Entity])` 등록 여부 확인
   - 없으면 해당 모듈에 추가해야 `@InjectRepository`가 동작함

2. **Constructor DI 선언** — `@InjectRepository(Entity)`로 주입
   ```typescript
   constructor(
     @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
   ) {}
   ```

3. **조회 패턴 선택**
   - HTTP 응답 경계(Controller)에서 쓰이면: `findOne` → null 체크 → `NotFoundException`
   - 내부 서비스 로직이면: `findOneOrFail` (EntityNotFoundError 자동 발생)
   - 정렬 필요 시: `findOne({ where, order: { field: 'DESC' } })`

4. **저장 패턴** — `create()`로 인스턴스 생성 후 `save()`로 DB 저장
   - `create()`: 인스턴스만 생성, DB 저장 안 함
   - `save()`: INSERT 또는 UPDATE (id 있으면 UPDATE)
   - 배치 저장: `save(array)` — Prisma `createMany` 대응

5. **부분 업데이트** — `update(criteria, partialEntity)`
   - 엔티티 전체를 로딩하지 않고 특정 필드만 변경할 때 사용
   - 반환값: `UpdateResult` (영향받은 행 수 등) — 저장된 엔티티가 아님

## 체크리스트

- [ ] 모듈의 `TypeOrmModule.forFeature([Entity])` 등록 확인
- [ ] `@InjectRepository(Entity)` 데코레이터 + `Repository<Entity>` 타입 선언
- [ ] 신규 엔티티 저장: `repo.save(repo.create(data))` 패턴 사용
- [ ] HTTP 경계 조회: `findOne` + null 체크 + `NotFoundException`
- [ ] 내부 로직 조회: `findOneOrFail` 사용 가능
- [ ] 특정 필드 업데이트: `repo.update(criteria, partialData)` 사용

## 패턴 참조

→ `references/patterns.md`
