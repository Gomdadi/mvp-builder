---
name: nestjs-repository-test
description: "TypeORM Repository를 사용하는 서비스의 Jest unit test를 작성한다. getRepositoryToken(Entity) mock 제공, create() 동기/save() 비동기 구분, 배치 저장 검증이 필요할 때 사용한다. 키워드: repository test, TypeORM mock, getRepositoryToken, create 동기 mock, save 비동기 mock"
---

# TypeORM Repository Unit Test 작성

## 트리거
- TypeORM Repository를 주입받는 서비스의 `*.service.spec.ts` 작성
- `@InjectRepository` 의존성을 mock해야 할 때
- DB 저장/업데이트 호출 인자 검증이 필요할 때

## 작성 워크플로우

1. **서비스에서 사용하는 Repository 메서드 파악** — 테스트 대상 서비스의 constructor에서 주입받는 Repository 목록 확인

2. **mock 객체 선언** — 파일 상단(describe 바깥), 사용하는 메서드만 포함
   ```ts
   const mockTaskRepo = {
     findOne: jest.fn(),
     findOneOrFail: jest.fn(),
     create: jest.fn(),   // 동기 — mockReturnValue 사용
     save: jest.fn(),     // 비동기 — mockResolvedValue 사용
     update: jest.fn(),
     count: jest.fn(),
   };
   ```

3. **TestingModule 설정** — `getRepositoryToken(Entity)` 토큰으로 provide
   - `@InjectRepository(Entity)` 내부적으로 `getRepositoryToken(Entity)` 토큰 사용
   - 타입 기반 주입이 아니므로 클래스 이름이 아닌 토큰 사용 필수
   ```ts
   { provide: getRepositoryToken(Task), useValue: mockTaskRepo }
   ```

4. **mock 리턴값 설정 구분**
   - `create()`: 동기 메서드 → `mockReturnValue({ projectId, name, ... })`
   - `save/find/findOne/findOneOrFail/update/count`: 비동기 → `mockResolvedValue(...)`

5. **테스트 케이스 작성**
   - Happy path: 정상 흐름, save/update 호출 검증
   - Not Found: `findOne → null → NotFoundException` 또는 `findOneOrFail → EntityNotFoundError`
   - API 실패: 외부 서비스 throw → DB 저장 미호출 검증

6. **배치 저장 검증** — `save(array)` 호출 시 `expect.arrayContaining` 사용
   ```ts
   expect(mockRepo.save).toHaveBeenCalledWith(
     expect.arrayContaining([
       expect.objectContaining({ name: 'Task A', orderIndex: 1 }),
     ]),
   );
   ```

## 체크리스트

- [ ] mock 객체는 파일 상단 describe 바깥에 선언
- [ ] `getRepositoryToken(Entity)` 토큰으로 provide (클래스명으로 provide하면 런타임 에러)
- [ ] `create()` mock: `mockReturnValue` (동기)
- [ ] `save/find/update` mock: `mockResolvedValue` (비동기)
- [ ] `beforeEach`에서 `jest.clearAllMocks()` 선행
- [ ] 에러 케이스에서 DB 저장 미호출 검증: `not.toHaveBeenCalled()`
- [ ] 배치 저장 검증: `expect.arrayContaining([expect.objectContaining(...)])`

## 패턴 참조

→ `references/patterns.md`
