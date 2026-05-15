---
name: claude-service-implement
description: >
  ClaudeAgentService(runAgentLoop / runWithTool)를 사용하는 NestJS 서비스 구현 파일(*.service.ts)을 작성한다.
  다음 상황에서 사용한다:
  (1) phase*.service.ts 형태의 Phase 서비스 신규 구현
  (2) claude-agent.service.ts 형태의 Anthropic SDK 래퍼 서비스 구현
  (3) runAgentLoop / runWithTool 호출 패턴 결정 및 작성
  (4) onToolCall 콜백으로 tool result 수집 후 Prisma 저장 로직 구현
  키워드: Claude 서비스 구현, runAgentLoop 구현, runWithTool, Phase 서비스, onToolCall
---

# claude-service-implement

## API 선택 기준

| 상황 | 사용 API |
|------|---------|
| 여러 tool을 **순서대로** 호출해야 함 (Phase 1, Phase 3 Backend) | `runAgentLoop` |
| tool을 **단 1회만** 호출하면 됨 (Phase 2, Phase 3 Frontend) | `runWithTool` |

## 구현 워크플로우

1. **의존성 결정** — 필요한 서비스를 constructor DI로 선언
2. **프롬프트 파일 준비** — `prompts/` 폴더에 MD 파일로 분리, `loadPrompt()`로 로딩
3. **Tool 정의** — `static readonly TOOLS` 배열에 Anthropic tool 스펙 선언
4. **API 호출 구현** — `runAgentLoop` 또는 `runWithTool` 중 선택
5. **결과 수집 및 검증** — 루프/호출 완료 후 필수 필드 존재 확인
6. **Prisma 저장** — 검증 통과 후 한 번에 저장

상세 코드 템플릿 → [references/patterns.md](references/patterns.md)

## 필수 구현 체크리스트

- [ ] `@Injectable()` 데코레이터
- [ ] `private static loadPrompt(filename)` 메서드로 프롬프트 파일 로딩
- [ ] Tool description은 static 필드에서 `loadPrompt()` 호출로 초기화
- [ ] System prompt는 생성자에서 `this.systemPrompt = loadPrompt(...)` 초기화
- [ ] `onToolCall` 콜백: 모든 tool 케이스를 `switch`로 처리, 각 케이스에서 다음 tool 안내 문자열 반환
- [ ] 루프 완료 후 필수 결과 필드 검증 (`if (!result.erd || ...)` → `throw`)
- [ ] Prisma 저장은 검증 통과 후 단 1회
- [ ] Phase 3 Task 상태 추적: 시작 시 `IN_PROGRESS`, 성공 시 `DONE`, 실패 시 `FAILED` (finally 블록)

## 중요 주의사항

- `__dirname`은 빌드 후 `dist/claude/`가 됨. `nest-cli.json`의 `assets` 설정에 `"prompts/**/*.md"`가 포함되어 있어야 MD 파일이 dist에 복사됨.
- `execFileSync`로 외부 script 호출 시 반드시 `try/catch` 처리 — 실패해도 메인 플로우는 계속되어야 하는 경우가 많음.
- `runWithTool`의 반환 타입은 `{ toolName: string; toolInput: unknown }` — 타입 단언(as) 후 접근.
