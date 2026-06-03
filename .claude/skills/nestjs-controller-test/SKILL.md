---
name: nestjs-controller-test
description: "NestJS Controller의 Jest unit test(*.controller.spec.ts)를 작성한다. Service를 mock하여 Controller 레이어만 격리 테스트한다. 키워드: controller test, unit test, service mock, 엔드포인트 테스트"
---

# NestJS Controller Unit Test 작성

## 트리거
- `*.controller.spec.ts` 신규 작성
- Controller 핸들러 동작 검증
- Service mock으로 Controller 레이어만 격리 테스트

## 작성 워크플로우

1. **Service mock 선언** — 파일 상단에 선언
   ```ts
   const mockService = { method: jest.fn() };
   ```

2. **TestingModule 설정** — `beforeEach`에서
   - `jest.clearAllMocks()` 선행
   - `controllers: [XxxController]`
   - `providers: [{ provide: XxxService, useValue: mockService }]`

3. **테스트 케이스 작성**
   - 핸들러가 올바른 인자로 서비스를 호출하는지 검증
   - 서비스 반환값을 그대로 반환하는지 검증
   - 예외 전파: 서비스가 예외를 throw하면 controller도 전파

4. **HTTP 레이어 통합 테스트가 필요한 경우** — `supertest` + `@nestjs/testing`의 `createNestApplication()` 사용
   - 보통 unit test로 충분하며 supertest는 e2e 단계에서 사용

## 체크리스트

- [ ] Service mock은 파일 상단 선언
- [ ] `beforeEach`에서 `jest.clearAllMocks()` 후 mock 리턴값 설정
- [ ] 핸들러 호출 인자 검증: `toHaveBeenCalledWith()`
- [ ] 반환값 검증: `toBe()` 또는 `toEqual()`
- [ ] Controller는 로직 없으므로 service 위임 여부만 확인

## 패턴 참조

→ `references/patterns.md`
