---
name: claude-service-test
description: >
  Anthropic Claude SDK 또는 ClaudeAgentService를 의존성으로 사용하는 NestJS 서비스의
  Jest unit test(*.service.spec.ts) 파일을 작성한다.
  다음 상황에서 사용한다:
  (1) phase*.service.spec.ts 형태의 Phase 서비스 테스트 작성
  (2) claude-agent.service.spec.ts 형태의 SDK 래퍼 서비스 테스트 작성
  (3) runAgentLoop / simulateAgentLoop 패턴 적용
  (4) @anthropic-ai/sdk mock 설정
  키워드: Claude 서비스 테스트, runAgentLoop 모킹, simulateAgentLoop, Anthropic SDK mock
---

# claude-service-test

이 프로젝트의 Claude 서비스 테스트는 두 유형으로 나뉜다.

## 서비스 유형 구분

| 유형 | 대상 | 핵심 mock |
|------|------|-----------|
| **Phase Service** | `phase*.service.ts` (비즈니스 로직) | `ClaudeAgentService`, `PrismaService`, `fs`, `child_process` |
| **Agent Service** | `claude-agent.service.ts` (SDK 래퍼) | `@anthropic-ai/sdk`, `ConfigService` |

→ 상세 패턴은 [references/patterns.md](references/patterns.md) 참조.

## 공통 워크플로우

1. **서비스 유형 파악** — 대상 서비스가 `ClaudeAgentService`를 주입받는지(Phase), SDK를 직접 쓰는지(Agent) 확인
2. **Mock 선언** — 파일 상단에 `jest.mock()` 블록 배치 (모듈 레벨)
3. **TestingModule 구성** — `beforeEach`에서 `Test.createTestingModule({ providers: [...] })`
4. **`jest.clearAllMocks()` 후 반환값 재설정** — clearAllMocks는 mock 반환값도 초기화하므로 반드시 재설정
5. **테스트 케이스 작성** — 아래 필수 케이스 체크리스트 준수

## 필수 테스트 케이스

### Phase Service

- [ ] 정상 흐름: `simulateAgentLoop`로 모든 tool 결과 주입 → DB 저장 확인
- [ ] 불완전 루프: 일부 tool만 호출 → `rejects.toThrow`
- [ ] API 실패: `runAgentLoop.mockRejectedValue(new Error(...))` → `rejects.toThrow`, DB 저장 안 함
- [ ] 프로젝트 없음: `findUniqueOrThrow`가 throw → `rejects.toThrow`

### Agent Service

- [ ] 정상 흐름: `messages.create`가 `tool_use` 블록 반환 → tool result 반환
- [ ] API 실패: `mockCreate.mockRejectedValue(...)` → `rejects.toThrow`
- [ ] 불완전 응답: tool_use 블록 없는 응답 → 적절한 예외 처리

## 중요 주의사항

- `jest.clearAllMocks()`는 `mockReturnValue`도 초기화한다. `beforeEach`에서 mock 선언 후 반드시 반환값을 재설정.
- `fs.readFileSync` mock은 static 필드 초기화 시점에 호출되므로 `beforeEach`마다 재설정 필요.
- Phase Service의 `simulateAgentLoop`는 `async` 함수여야 한다 (`onToolCall`이 Promise 반환).
- DB 저장 금지 검증: 에러 케이스에서 `expect(mockPrisma.xxx.create).not.toHaveBeenCalled()` 반드시 포함.
