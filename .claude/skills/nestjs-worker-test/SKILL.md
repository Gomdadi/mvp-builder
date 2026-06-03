---
name: nestjs-worker-test
description: "NestJS BullMQ Worker의 Jest unit test(*.worker.spec.ts)를 작성한다. Job 객체 mock, 의존 서비스 mock, process() 직접 호출로 핸들러 테스트, DB 상태 전이 검증이 필요할 때 사용한다. 키워드: worker test, BullMQ 테스트, Job mock, 상태 전이 검증, getRepositoryToken"
---

# NestJS Worker Unit Test 작성

## 트리거
- `*.worker.spec.ts` 신규 작성
- Worker Job 핸들러 동작 검증
- DB 상태 전이(IN_PROGRESS → DONE/FAILED) 검증

## 작성 워크플로우

1. **mock 선언** — 파일 상단
   ```ts
   const mockService = { method: jest.fn() };
   const mockEntityRepo = { update: jest.fn() };
   ```

2. **Job mock 생성 헬퍼**
   ```ts
   const makeJob = (name: string, data: object) =>
     ({ name, data }) as Job;
   ```

3. **TestingModule 설정** — `beforeEach`에서
   - `jest.clearAllMocks()` 선행
   - Worker를 provider로 등록
   - 서비스는 클래스 토큰으로, Repository는 `getRepositoryToken(Entity)` 토큰으로 provide

4. **테스트 케이스 구성**
   - Happy path: `process(job)` 호출 → 서비스 호출 검증 → DB 상태 DONE 검증
   - 실패 케이스: 서비스가 throw → DB 상태 FAILED 검증 + 예외 re-throw 검증
   - 알 수 없는 job.name: 예외 throw 검증

5. **DB 상태 전이 순서 검증** — `nthCalledWith(n, criteria, partialData)`
   - 1번째 호출: `IN_PROGRESS` 업데이트
   - 2번째 호출: `DONE` 또는 `FAILED` 업데이트

## 체크리스트

- [ ] Job mock은 `{ name, data } as Job` 형태로 생성
- [ ] Repository: `getRepositoryToken(Entity)` 토큰으로 provide
- [ ] `beforeEach`에서 `jest.clearAllMocks()` 후 mock 리턴값 재설정
- [ ] Happy path / 실패 케이스 / 알 수 없는 job.name 케이스 포함
- [ ] 에러 케이스: 예외 re-throw 검증 (`rejects.toThrow`)
- [ ] DB 상태 전이 순서: `nthCalledWith` 사용
- [ ] `update()` 인자 검증: `(criteria, partialData)` 형태 확인

## 패턴 참조

→ `references/patterns.md`
