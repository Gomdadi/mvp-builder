---
name: nestjs-service-implement
description: "NestJS Service 파일(*.service.ts)을 작성한다. 비즈니스 로직 구현, Constructor DI 선언, TypeORM Repository/Queue 연동, NestJS 예외 처리가 필요할 때 사용한다. 키워드: service 구현, 비즈니스 로직, Injectable, Repository, @InjectRepository, 예외 처리"
---

# NestJS Service 구현

## 트리거
- `*.service.ts` 신규 작성
- 기존 서비스에 메서드 추가
- TypeORM Repository / Queue / 외부 서비스 연동이 필요한 비즈니스 로직 구현

## 구현 워크플로우

1. **의존성 파악** — 어떤 서비스/레포지토리가 필요한지 파악한다
   - DB 접근: `@InjectRepository(Entity) private readonly repo: Repository<Entity>`
   - 설정값: `ConfigService`
   - 비동기 큐: `@InjectQueue(QUEUE_NAME) queue: Queue`
   - 외부 서비스: 커스텀 서비스 inject

2. **Constructor DI 선언** — `constructor(private readonly ...)` 형태로 주입
   - Repository는 `@InjectRepository(Entity)` 데코레이터 필수
   - Queue는 `@InjectQueue()` 데코레이터 필수

3. **메서드 구현** — 각 public 메서드는 하나의 책임만
   - DB 조회 → 비즈니스 규칙 검증 → 상태 변경 → 반환 순서로 작성
   - `findOneOrFail` 사용 시 Not Found 예외 자동 발생 (EntityNotFoundError)
   - HTTP 경계에서는 `findOne` + null 체크 + `NotFoundException` 패턴 사용

4. **예외 처리** — NestJS 내장 예외 사용
   - `NotFoundException`: 리소스 없음
   - `ConflictException`: 중복/충돌 상태
   - `BadRequestException`: 잘못된 입력
   - `ForbiddenException`: 권한 없음

5. **반환 타입** — 필요한 필드만 포함한 객체 반환 (Entity 전체 반환 지양)

## 체크리스트

- [ ] `@Injectable()` 데코레이터 선언
- [ ] 모든 의존성 `private readonly`로 주입
- [ ] Repository: `@InjectRepository(Entity)` 데코레이터 사용
- [ ] Queue inject 시 `@InjectQueue(TOKEN)` 데코레이터 사용
- [ ] 메서드당 단일 책임
- [ ] DB 조회 실패 시 적절한 NestJS 예외 throw
- [ ] 신규 저장: `repo.save(repo.create(data))` 패턴 사용
- [ ] 반환 타입에 민감 정보(password 등) 미포함

## 패턴 참조

→ `references/patterns.md`
