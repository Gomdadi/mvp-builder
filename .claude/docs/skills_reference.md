# Claude Code 자동화 워크플로우 레퍼런스

JIRA 티켓 기반으로 Claude Code가 수행하는 전체 개발 자동화 파이프라인 정의서.

---

## 전체 흐름 요약

```
JIRA 티켓
  └─ Step 1: 티켓 분석
  └─ Step 2: 브랜치 준비 (Git Worktree)
  └─ Step 3: SDD 계획서 작성
  └─ Step 4: 사용자 승인 게이트
  └─ Step 5-6: TDD 구현 (레이어별 Agent 디스패치)
  └─ Step 7: 코드 리뷰 (Agent 디스패치)
  └─ Step 7.5: 유비쿼터스 언어 최신화
  └─ Step 8: 사용자 승인 → Git Commit
  └─ Step 9: JIRA 코멘트 작성
  └─ Step 10: 사용자 승인 → PR 생성
```

---

## 단계별 상세 설명

### Step 1: JIRA 티켓 분석 (Main Claude → MCP)

- MCP를 통해 JIRA 티켓 내용을 조회한다.
- 티켓의 요구사항, 수용 기준(Acceptance Criteria), 관련 이슈를 파악한다.
- 이후 단계를 위한 컨텍스트를 구성한다.

---

### Step 2: 작업 브랜치 준비 (Main Claude → Git Worktree)

메인 작업과 격리된 worktree를 생성해 브랜치 충돌 없이 병렬 작업이 가능하게 한다.

| 기준 | 명령어 |
|------|--------|
| main 기준 | `git worktree add ../partner-meta-{TICKET-ID} -b feature/{TICKET-ID} main` |
| 현재 브랜치 기준 | `git worktree add ../partner-meta-{TICKET-ID} -b feature/{TICKET-ID}` |

> `{TICKET-ID}`는 JIRA 티켓 ID로 치환한다. (예: `PAYMENTSRV-41748`)

---

### Step 3: SDD 계획서 작성 (Main Claude)

Software Design Document를 작성한다. 포함 항목:

- 변경 대상 레이어 및 파일 목록
- 인터페이스 / API 변경 사항
- DB 스키마 변경 여부
- 테스트 전략 (단위 / 통합)
- 예상 사이드 이펙트

---

### Step 4: 사용자 승인 게이트

```
[수정 요청] ──→ Step 3으로 복귀 (재작성)
[승인]      ──→ Step 5-6으로 진행
```

SDD가 확정되기 전까지 구현을 시작하지 않는다.

---

### Step 5-6: TDD 구현 (레이어별 Agent 디스패치)

SDD를 기반으로 레이어별 Agent를 병렬 또는 순차 디스패치해 구현한다.

| 레이어 | 순서 |
|--------|------|
| BACKEND | `generate_test_code` → `generate_implementation_code` |
| FRONTEND | 디자인 시스템 주입 → `generate_ui_component` |

- 각 태스크는 `IN_PROGRESS` → `DONE` / `FAILED` 상태로 추적된다.
- 실패 시 상태를 `FAILED`로 기록하고 다음 단계로 넘기지 않는다.

---

### Step 7: 코드 리뷰 (Agent 디스패치)

별도 리뷰 Agent가 구현 결과를 검토한다.

```
[PASS / PASS WITH COMMENTS] ──→ Step 7.5로 진행
[FAIL]                       ──→ Step 7-a: Review Check
    ├─ [AGREE / PARTIAL]  → 수정 후 재리뷰 (최대 2회 순환)
    └─ [DISAGREE]         → 사용자 에스컬레이션
```

- 재리뷰는 최대 **2회**까지만 자동 순환한다.
- 2회 초과 또는 DISAGREE 시 사람이 직접 판단한다.

---

### Step 7.5: 유비쿼터스 언어 최신화 체크 (Main Claude)

도메인 용어 변경이 발생한 경우 `docs/domain-glossary.md` (또는 유사 경로)를 업데이트한다.

- 변경된 용어가 코드 내 주석, 변수명, API 명세에 일관되게 반영됐는지 확인한다.
- 변경 없으면 이 단계는 스킵한다.

---

### Step 8: 사용자 승인 → Git Commit (Main Claude)

```
사용자 승인 ──→ git commit
```

- 커밋 메시지는 `{TICKET-ID}: {변경 이유 요약}` 형식을 따른다.
- 승인 없이 커밋하지 않는다.

---

### Step 9: JIRA 코멘트 작성 (Main Claude → MCP)

MCP를 통해 JIRA 티켓에 작업 완료 코멘트를 자동 등록한다. 포함 내용:

- 변경 파일 목록
- 구현 요약
- 테스트 결과 (통과 케이스 수)
- 리뷰 결과 요약

---

### Step 10: 사용자 승인 → PR 생성 (Main Claude)

```
사용자 승인 ──→ gh pr create
```

PR 본문에 자동 포함되는 항목:

- 연결된 JIRA 티켓 링크
- 변경 사항 요약 (SDD 기반)
- 테스트 체크리스트
- `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`

---

## 핵심 원칙

| 원칙 | 설명 |
|------|------|
| 사용자 게이트 | SDD 승인, Commit, PR 생성 3곳에서 반드시 사람이 확인 |
| 재리뷰 상한 | 코드 리뷰 자동 순환은 최대 2회 |
| 에스컬레이션 | Agent 간 의견 불일치 시 자동 해결 시도하지 않고 사용자에게 위임 |
| Worktree 격리 | 작업마다 독립된 worktree를 사용해 메인 브랜치를 보호 |
| 상태 추적 | 모든 태스크는 DB에 `IN_PROGRESS → DONE / FAILED` 로 기록 |
