# Agent 기반 TDD 파이프라인 오케스트레이션 — 추상화 가이드

Skill들을 조합해 TDD 개발 사이클을 자동화하는 Agent 시스템 설계 문서.
다른 프로젝트에 동일한 패턴을 이식할 때 참고한다.

---

## 왜 Agent 오케스트레이션인가

단일 Claude 인스턴스가 모든 작업을 순차 처리하면:
- 컨텍스트 창이 구현 코드 + 테스트 코드 + 리뷰 결과로 빠르게 포화된다
- 레이어 간 관심사가 뒤섞여 코드 품질이 저하된다
- 한 레이어 실패가 전체 작업을 중단시킨다

**Agent 분리**를 통해:
- 각 Agent는 하나의 관심사만 컨텍스트에 담는다
- 레이어를 병렬 실행하거나 실패한 레이어만 재시도할 수 있다
- Orchestrator는 "무엇을"만 결정하고, Worker Agent가 "어떻게"를 처리한다

---

## Agent 전체 지도

```
사용자 or 외부 트리거 (JIRA 티켓 ID)
          │
          ▼
┌─────────────────────┐
│  Orchestrator Agent  │  ← Main Claude (파이프라인 조율)
└─────────────────────┘
          │
    Task 분해
          │
    ┌─────┴──────────────────────────────────────────┐
    │ Layer 1          Layer 2          Layer N      │
    │ (DTO)            (Service)        (Worker)     │
    │   │                │                │          │
    │   ▼                ▼                ▼          │
    │ [TDD Agent]    [TDD Agent]     [TDD Agent]     │  ← Worker Agents
    │   │ test         │ test           │ test       │
    │   │ impl         │ impl           │ impl       │
    └───┼──────────────┼────────────────┼────────────┘
        │              │                │
        └──────────────┴────────────────┘
                       │
                       ▼
             ┌──────────────────┐
             │ Review Agent      │  ← 독립 리뷰 (최대 2회 순환)
             └──────────────────┘
                       │
                       ▼
             ┌──────────────────┐
             │ Git-PR Agent      │
             └──────────────────┘
                       │
                       ▼
             ┌──────────────────┐
             │ Notify Agent      │
             └──────────────────┘
```

---

## Agent 유형 정의

### 1. Orchestrator Agent

**역할**: 전체 파이프라인 조율. Task를 레이어로 분해하고 Worker Agent를 디스패치한다.

**하는 일**:
- JIRA/이슈 트래커에서 Task 수신
- SDD(Software Design Document) 작성
- 사용자 승인 게이트 관리
- Worker Agent 실행 순서 결정 (병렬 vs 순차)
- 실패한 Agent 재시도 또는 에스컬레이션

**사용 Skill**: `jira-fetch`

**디스패치 기준**:
```
SDD의 변경 레이어 목록
  → 레이어당 TDD Worker Agent 1개 생성
  → 의존 관계 없는 레이어: 병렬 디스패치
  → 의존 관계 있는 레이어: 순차 디스패치
```

**의사결정 규칙**:
- SDD 승인 전: 구현 Agent 디스패치 금지
- Worker Agent 실패 시: 최대 1회 재시도 → 초과 시 에스컬레이션
- Review Agent FAIL 2회 초과: 사용자 에스컬레이션

---

### 2. TDD Worker Agent (레이어당 1개)

**역할**: 특정 레이어의 Test 작성 → 구현 코드 작성을 TDD 순서로 완료한다.

**하는 일**:
1. SDD에서 자신이 담당할 레이어 파일 목록 수신
2. **Test 작성** (`{framework}-{layer}-test` skill 호출)
3. 테스트가 실패함을 확인 (Red 상태)
4. **구현 코드 작성** (`{framework}-{layer}-implement` skill 호출)
5. 테스트 통과 확인 (Green 상태)
6. 결과를 Orchestrator에 반환

**입력**: SDD 레이어 명세 (담당 파일 목록, 인터페이스 정의, 요구사항)
**출력**: 작성된 test 파일 + impl 파일 + 테스트 통과 여부

**TDD 사이클**:
```
1. Test 파일 작성 (실패 상태)
   → 테스트 실행 → FAIL 확인
2. 구현 파일 작성
   → 테스트 실행 → PASS 확인
3. 통과 실패 시 → 구현 파일 수정 (최대 3회)
4. 3회 초과 → Orchestrator에 FAILED 반환
```

**격리 원칙**:
- 자신의 레이어 파일만 수정한다
- 다른 레이어 파일을 직접 편집하지 않는다
- 인접 레이어 변경이 필요하면 Orchestrator에 보고한다

---

### 3. Review Agent

**역할**: 구현 결과를 독립적 시각으로 검토한다. 구현에 참여하지 않아 편향 없는 리뷰가 가능하다.

**하는 일**:
- 변경된 전체 파일 읽기 (`git diff`)
- `code-review` skill 체크리스트 순서로 검토
- 이슈 목록 분류 (MUST FIX / SHOULD FIX / SUGGESTION)
- FAIL 시 수정 대상 파일과 이슈 내용을 Orchestrator에 반환

**출력 구조**:
```
결과: PASS | PASS_WITH_COMMENTS | FAIL
이슈 목록:
  - [MUST FIX] service.ts:42 — null 체크 누락
  - [SHOULD FIX] controller.ts:15 — 에러 응답 형식 불일치
  - [SUGGESTION] dto.ts:8 — 필드명 컨벤션 통일
```

**순환 제어**: Orchestrator가 관리한다. Review Agent 자신은 순환 횟수를 추적하지 않는다.

---

### 4. Git-PR Agent

**역할**: 승인된 코드를 commit하고 PR을 생성한다.

**하는 일**:
- `git-pr` skill 실행
- 커밋 메시지 생성 (TICKET-ID + 변경 이유)
- 브랜치 push
- `gh pr create` 실행 (PR 본문 자동 구성)

**사전 조건**: 사용자 승인 또는 Orchestrator의 명시적 디스패치

---

### 5. Notify Agent

**역할**: 작업 완료 사실을 외부 시스템에 전파한다.

**하는 일**:
- JIRA 티켓에 완료 코멘트 작성 (`notify` skill)
- Slack 지정 채널에 결과 메시지 전송
- 필요 시 JIRA 상태 전환 (In Progress → In Review)

---

## 파이프라인 실행 흐름

### 정상 경로

```
[Orchestrator]
  1. jira-fetch skill → 티켓 분석
  2. SDD 작성
  3. 사용자 승인 요청 ──→ [거부] → SDD 수정 후 재요청
                     └──→ [승인]

  4. SDD의 레이어 목록 파싱
  5. TDD Worker Agent 디스패치 (레이어 의존 관계에 따라 병렬/순차)

[TDD Worker Agent × N]
  6. Test 작성 → 실패 확인 (Red)
  7. 구현 코드 작성 → 통과 확인 (Green)
  8. 완료 신호 → Orchestrator 반환

[Orchestrator]
  9. 모든 Worker 완료 확인
  10. Review Agent 디스패치

[Review Agent]
  11. 코드 리뷰 실행
  12. 결과 반환

[Orchestrator]
  13. PASS → 다음 단계
      FAIL → 해당 Worker Agent 재실행 (최대 2회)
             2회 초과 → 사용자 에스컬레이션

  14. 사용자 승인 요청 ──→ [거부] → 수정 후 재리뷰
                     └──→ [승인]

[Git-PR Agent]
  15. commit → push → PR 생성

[Notify Agent]
  16. JIRA 코멘트 + Slack 전송
```

### 실패 경로 및 에스컬레이션

```
TDD Worker Agent 실패 (3회 구현 시도 초과)
  → Orchestrator가 실패 레이어와 오류 메시지를 사용자에게 보고
  → 사용자 지시 대기 (부분 완료 상태 유지)

Review Agent FAIL 2회 초과
  → 이슈 목록 + 현재 코드를 사용자에게 제시
  → "동의 / 부분 동의 / 무시" 선택 요청

Review Agent DISAGREE (Claude 판단으로 이슈가 아님)
  → 즉시 사용자 에스컬레이션 (자동 해결 시도 없음)
```

---

## 레이어 분해 전략

Orchestrator가 SDD를 보고 Worker Agent 실행 순서를 결정한다.

### 의존 관계 기반 순서

```
병렬 실행 가능:
  DTO (다른 레이어에 의존하지 않음)

DTO 완료 후 순차 실행:
  Service (DTO에 의존)
  Repository (DTO에 의존)

Service + Repository 완료 후:
  Controller (Service에 의존)

Controller 완료 후:
  Module (모두 등록)
  Worker (Service에 의존)
```

### 프레임워크별 레이어 매핑 예시

| 프레임워크 | 레이어 순서 |
|-----------|------------|
| NestJS | DTO → Service → Controller → Module → Worker |
| FastAPI | Schema → Service → Router → (없음) |
| Spring | DTO → Service → Repository → Controller |
| Express | Schema → Service → Route → Middleware |

Orchestrator는 `skills_reference.md`의 레이어 순서를 읽어 순서를 결정한다.

---

## Agent 간 인터페이스

Agent끼리 주고받는 데이터 구조를 명시한다. 형식은 프로젝트에 맞게 조정하되, 아래 필드는 최소 포함한다.

### Orchestrator → TDD Worker Agent

```yaml
task:
  ticket_id: "PROJECT-1234"
  layer: "service"           # 담당 레이어
  files:                     # 작성할 파일 경로
    - src/feature/feature.service.ts
    - src/feature/feature.service.spec.ts
  interface: |               # 구현해야 할 메서드 시그니처
    create(dto: CreateFeatureDto): Promise<Feature>
    findOne(id: string): Promise<Feature>
  context: |                 # 인접 레이어 정보 (mock 작성에 필요)
    FeatureRepository: save(), findOne()
```

### TDD Worker Agent → Orchestrator

```yaml
result:
  layer: "service"
  status: DONE | FAILED
  files_written:
    - src/feature/feature.service.ts
    - src/feature/feature.service.spec.ts
  test_count: 6
  test_passed: 6
  error: null | "구현 3회 시도 초과: ..."
```

### Orchestrator → Review Agent

```yaml
review_request:
  ticket_id: "PROJECT-1234"
  diff_base: "main"          # git diff 기준 브랜치
  sdd: |                     # 원래 요구사항 (리뷰 기준)
    ...
  review_round: 1            # 현재 리뷰 회차 (최대 2)
```

### Review Agent → Orchestrator

```yaml
review_result:
  verdict: PASS | PASS_WITH_COMMENTS | FAIL
  issues:
    - severity: MUST_FIX | SHOULD_FIX | SUGGESTION
      file: src/feature/feature.service.ts
      line: 42
      message: "null 체크 누락 — findOne 반환값이 null일 때 NotFoundException을 throw해야 함"
```

---

## SKILL.md vs Agent 역할 분리

혼동하기 쉬운 부분을 명확히 한다.

| 구분 | 역할 | 위치 |
|------|------|------|
| **Skill** | 단일 작업의 HOW 정의 (코드 패턴, 체크리스트) | `.claude/skills/{name}/SKILL.md` |
| **Agent** | 여러 Skill의 실행 순서와 조건 조율 | Claude Code의 sub-agent 또는 Main Claude의 역할 분담 |
| **Orchestrator** | Agent 디스패치, 승인 게이트, 에스컬레이션 판단 | Main Claude |

**Skill은 Agent가 "어떻게" 할지를 알려주는 참조 문서이고,
Agent는 Skill을 "언제, 어떤 순서로" 호출할지 결정하는 실행 주체다.**

---

## 새 프로젝트 적용 체크리스트

```
[ ] 1. skills_reference.md 작성
       - 레이어 목록과 의존 관계 명시
       - 각 레이어에 매핑되는 skill 이름 명시

[ ] 2. 레이어 skill 생성 (레이어당 implement + test 쌍)
       - SKILL.md: 트리거, 워크플로우, 체크리스트
       - references/patterns.md: 코드 패턴

[ ] 3. 공통 skill 생성
       - jira-fetch (또는 github-issue-fetch, linear-fetch)
       - code-review
       - git-pr
       - notify

[ ] 4. Orchestrator 지시 파일 작성 (CLAUDE.md 또는 별도 파일)
       - 파이프라인 트리거 조건 ("TICKET-{ID} 구현해줘")
       - 승인 게이트 위치 명시
       - 실패/에스컬레이션 규칙

[ ] 5. MCP 설정 (settings.json)
       - JIRA / Linear / GitHub Issues MCP
       - Slack / Teams MCP

[ ] 6. 환경 변수 설정
       - JIRA_API_TOKEN, SLACK_BOT_TOKEN 등
```

---

## 핵심 설계 원칙 요약

| 원칙 | 이유 |
|------|------|
| **TDD 순서 강제** | Test 먼저 작성해야 요구사항이 코드에 반영됨. 구현 먼저 쓰면 테스트가 구현을 추종하게 됨 |
| **레이어 격리** | 각 Worker Agent는 자신의 레이어 파일만 수정. 사이드 이펙트 추적 가능 |
| **Review Agent 독립성** | 구현에 참여하지 않은 Agent가 리뷰해야 편향 없는 검토 가능 |
| **사용자 게이트 최소화** | SDD 승인 → Commit 승인 → PR/공유 승인, 3곳만. 나머지는 자동 처리 |
| **에스컬레이션 명시** | 자동 해결 불가능한 상황(2회 초과, DISAGREE)은 즉시 사람에게 위임. 무한 루프 방지 |
| **Orchestrator는 실행하지 않음** | Orchestrator는 조율만. 직접 코드를 쓰지 않고 Agent에 위임 |
