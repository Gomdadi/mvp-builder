# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 주석 원칙

**모든 코드에는 주석만 봐도 코드를 이해할 수 있을 정도로 상세히 작성한다.**

- 클래스·메서드: 목적, 동작 흐름, 중요한 전제조건을 주석으로 설명
- 복잡한 로직, NestJS/BullMQ/Prisma API의 비자명한 동작: 반드시 인라인 주석 추가
- 기존 코드 스타일을 보면 알 수 있듯이, 각 필드·옵션·분기의 의미를 짧은 줄 주석으로 설명

---

## 코딩 가이드라인

### 1. 코딩 전에 생각한다

**가정하지 않는다. 모호함을 숨기지 않는다. 트레이드오프를 드러낸다.**

구현 전에:
- 가정이 있으면 명시적으로 밝힌다. 불확실하면 묻는다.
- 해석이 여러 가지이면 모두 제시한다 — 혼자 선택하지 않는다.
- 더 단순한 방법이 있으면 말한다. 필요하면 반론한다.
- 불명확한 부분이 있으면 멈춘다. 무엇이 혼란스러운지 명시하고 묻는다.

### 2. 단순함을 우선한다

**문제를 해결하는 최소한의 코드. 추측성 코드는 없다.**

- 요청된 것 이상의 기능을 추가하지 않는다.
- 단일 사용 코드에 추상화를 만들지 않는다.
- 요청하지 않은 "유연성"이나 "확장성"을 추가하지 않는다.
- 불가능한 시나리오에 대한 에러 처리를 추가하지 않는다.
- 200줄로 쓴 것을 50줄로 쓸 수 있다면 다시 쓴다.

스스로에게 물어본다: "시니어 엔지니어가 이걸 보고 과도하다고 할까?" — 그렇다면 단순화한다.

### 3. 최소한의 변경만 한다

**꼭 필요한 것만 수정한다. 내가 만든 부분만 정리한다.**

기존 코드를 수정할 때:
- 인접한 코드, 주석, 포맷을 "개선"하지 않는다.
- 고장나지 않은 것을 리팩토링하지 않는다.
- 내 방식이 달라도 기존 스타일을 따른다.
- 관련 없는 죽은 코드를 발견하면 언급하되 — 삭제하지 않는다.

내 변경으로 생긴 orphan:
- 내 변경이 만들어낸 미사용 import/변수/함수는 제거한다.
- 기존에 있던 죽은 코드는 요청받지 않으면 제거하지 않는다.

테스트: 변경된 모든 줄이 사용자의 요청으로 직접 추적 가능해야 한다.

### 4. 목표 중심으로 실행한다

**성공 기준을 정의한다. 검증될 때까지 반복한다.**

태스크를 검증 가능한 목표로 변환한다:
- "검증 추가" → "유효하지 않은 입력에 대한 테스트를 작성하고, 통과시킨다"
- "버그 수정" → "버그를 재현하는 테스트를 작성하고, 통과시킨다"
- "X 리팩토링" → "리팩토링 전후에 테스트가 통과하는지 확인한다"

여러 단계 태스크는 간략한 계획을 먼저 제시한다:
```
1. [단계] → 검증: [확인 방법]
2. [단계] → 검증: [확인 방법]
3. [단계] → 검증: [확인 방법]
```

---

## 개발 명령어

**Backend** (`apps/backend/`):

```bash
# 개발 서버 (hot reload)
npm run dev

# 빌드
npm run build

# 프로덕션 실행
npm run start:prod

# 전체 테스트
npm test

# 단일 테스트 파일 실행
npx jest src/claude/phase1.service.spec.ts

# 특정 테스트 이름 패턴으로 실행
npx jest --testNamePattern="run should"

# 테스트 watch 모드
npm run test:watch

# 커버리지
npm run test:cov

# Lint (자동 수정 포함)
npm run lint

# TypeORM 마이그레이션 생성 (엔티티 변경 후)
npx typeorm migration:generate src/migrations/<migration-name> -d src/data-source.ts

# TypeORM 마이그레이션 실행
npx typeorm migration:run -d src/data-source.ts
```

**Frontend** (`apps/frontend/`): 프론트엔드 구현 후 추가 예정

**인프라** (프로젝트 루트):
```bash
docker-compose up -d          # Postgres + Redis + LocalStack 시작
docker-compose down           # 인프라 중지
```

---

## 아키텍처

### 전체 구조

NestJS 모노리스. HTTP 요청은 동기 처리, AI 코드 생성 파이프라인은 BullMQ를 통해 비동기 처리. DB는 TypeORM + PostgreSQL.

```
HTTP 요청 → PipelineController → PipelineService → BullMQ 큐 enqueue → 즉시 응답
                                                           ↓
                                               PipelineWorker (백그라운드)
                                                           ↓
                                          Phase1Service / Phase2Service / Phase3Service
                                                           ↓
                                               ClaudeAgentService (Anthropic API)
```

### 파이프라인 3단계

| 단계 | 역할 | Claude 호출 방식 | 툴 수 |
|------|------|-----------------|-------|
| Phase 1 | MVP 분석 문서 생성 (ERD, API spec, Architecture, Directory) | `runAgentLoop` | 4개 순서 강제 |
| Phase 2 | 구현 태스크 목록 분해 | `runWithTool` | 1개 |
| Phase 3 (Backend) | TDD 방식 코드 생성 (test → impl 순서) | `runAgentLoop` | 2개 |
| Phase 3 (Frontend) | UI 컴포넌트 생성 | `runWithTool` | 1개 |

### ClaudeAgentService

`claude-agent.service.ts`가 Anthropic API 호출을 추상화하는 핵심 서비스.

- `runWithTool()`: 단건 호출, `tool_use` 블록에서 JSON 추출 반환. Phase 2, Phase 3 Frontend에서 사용.
- `runAgentLoop()`: Claude가 `end_turn`을 반환할 때까지 tool_use → tool_result 대화를 반복. Phase 1, Phase 3 Backend에서 사용.
- `stream()`: SSE 등 실시간 응답용 AsyncGenerator. 현재 미사용.
- `buildParams()`: `ClaudeCallOptions`(내부 추상화)를 Anthropic SDK 파라미터로 변환.

`tool_choice` 동작:
- `toolName` 지정 시: `{ type: 'tool', name }` — 특정 툴만 강제
- 미지정 시: `{ type: 'any' }` — 어떤 툴이든 반드시 사용
- `runAgentLoop`는 항상 `{ type: 'auto' }` — Claude가 자유롭게 결정

### 프롬프트 관리

`src/claude/prompts/*.md` 파일로 시스템 프롬프트와 툴 description을 관리한다.

- `phase{N}-system.md`: 시스템 프롬프트 (Claude 역할·행동 지시)
- `phase{N}-tool-{name}.md`: 툴 description (Claude가 언제 어떻게 이 툴을 호출할지 지시)

`loadPrompt()` static 메서드로 클래스 로드 시점에 한 번만 읽어 `static readonly` 필드에 캐싱.
`nest-cli.json`의 `assets` 설정으로 빌드 시 `dist/claude/prompts/`에도 복사됨.

### DB 스키마 핵심 관계

엔티티 파일 위치: `src/entities/` (enums.ts + 5개 entity 파일)

```
User → Project → AnalysisDocument (Phase 1 결과, isConfirmed=true인 것이 Phase 2 입력)
               → PipelineRun → Task (Phase 2 분해 결과, Phase 3이 순서대로 처리)
```

- `AnalysisDocument.directoryStructure`: `JSONB` — Phase 3 코드 생성 시 파일 목록으로 주입
- `AnalysisDocument.designSystem`: Phase 1 시 UI_UX_SKILL 검색 결과 (없으면 null, Phase 3 Frontend에 주입)
- `Task.type`: `BACKEND` | `FRONTEND` — Phase 3에서 분기 결정
- `Task.orderIndex`: Phase 2가 Claude로부터 받은 실행 순서

엔티티 프로퍼티에는 `!` (definite assignment assertion)을 붙인다 — TypeORM이 DB에서 값을 채워주므로 TypeScript의 `strictPropertyInitialization` 경고를 억제하기 위함.

### S3 키 패턴

Phase 3 생성 코드는 `generated/{projectId}/{filePath}` 키로 저장.
`s3.service.ts`의 `generatedKey()` 함수가 단일 진실 공급원 — 키 패턴 변경 시 이 함수만 수정.

### 인프라

- Postgres (5432): 메인 DB
- Redis (6379): BullMQ 잡 큐
- LocalStack (4566): S3 로컬 에뮬레이터 (버킷명 `.env`의 `S3_BUCKET`)

### 미구현 상태

`pipeline.worker.ts`의 `handleStart` / `handleFeedback` / `handleConfirm` 메서드는 현재 stub.
Phase 1/2/3 Service를 조합해서 Worker에 연결하는 것이 다음 구현 대상.

---

## 환경 변수

`apps/backend/.env`:

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/mvp_builder
REDIS_HOST=localhost
REDIS_PORT=6379
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6        # 기본값
CLAUDE_API_TIMEOUT=120000             # 기본값 (ms)
CLAUDE_API_MAX_RETRIES=2              # 기본값
S3_BUCKET=mvp-builder
S3_ENDPOINT=http://localhost:4566     # LocalStack 사용 시
UI_UX_SKILL_PATH=/path/to/ui-ux-skill # 없으면 designSystem 생성 skip
```
