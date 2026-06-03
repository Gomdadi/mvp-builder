---
name: nestjs-service-test
description: "NestJS Service의 Jest unit test(*.service.spec.ts)를 작성한다. mock 객체 선언, TestingModule 설정, happy path/에러 케이스/Not Found 케이스 작성이 필요할 때 사용한다. 키워드: service test, unit test, jest mock, mockResolvedValue, TestingModule, getRepositoryToken"
---

# NestJS Service Unit Test 작성

## 트리거
- `*.service.spec.ts` 신규 작성
- 기존 service test에 케이스 추가
- TypeORM Repository / Queue / 외부 서비스를 mock해야 할 때

## 작성 워크플로우

1. **서비스 의존성 파악** — 테스트 대상 서비스의 constructor 의존성 목록 확인

2. **mock 객체 선언** — 파일 상단(describe 바깥)에 선언
   ```ts
   const mockTaskRepo = {
     findOne: jest.fn(),
     create: jest.fn(),   // 동기 — mockReturnValue
     save: jest.fn(),     // 비동기 — mockResolvedValue
     update: jest.fn(),
   };
   const mockQueue = { add: jest.fn() };
   ```

3. **TestingModule 설정** — `beforeEach` 안에서
   - `jest.clearAllMocks()` 먼저 호출 (리턴값 초기화)
   - `getRepositoryToken(Entity)` 토큰으로 Repository provide
   - Queue는 `getQueueToken(QUEUE_NAME)` 토큰으로 provide

4. **테스트 케이스 작성**
   - Happy path: 정상 흐름, DB 저장/큐 추가 검증
   - Not Found: `findOne → null → NotFoundException` 또는 `findOneOrFail → EntityNotFoundError`
   - 충돌/중복: ConflictException 검증
   - DB 미저장 검증: 에러 케이스에서 `not.toHaveBeenCalled()`

5. **create/save mock 구분**
   - `create()`: 동기 → `mockReturnValue` 사용
   - `save/find/update/count`: 비동기 → `mockResolvedValue` 사용

## 체크리스트

- [ ] mock 객체는 파일 상단 describe 바깥에 선언
- [ ] `beforeEach`에서 `jest.clearAllMocks()` 선행 후 리턴값 재설정
- [ ] Repository: `getRepositoryToken(Entity)` 토큰으로 provide
- [ ] Queue: `getQueueToken(QUEUE_NAME)` 토큰 사용
- [ ] `create()` mock: `mockReturnValue` (동기)
- [ ] `save/find/update` mock: `mockResolvedValue` (비동기)
- [ ] 예외 검증: `await expect(service.method()).rejects.toThrow(XxxException)`
- [ ] 에러 케이스에서 DB 저장 미호출 검증
- [ ] `expect.objectContaining()` 활용으로 partial match

## 패턴 참조

→ `references/patterns.md`
