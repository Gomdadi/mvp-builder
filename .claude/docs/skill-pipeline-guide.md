# Claude Code Skill 기반 자동화 개발 파이프라인 — 범용 가이드

다른 프로젝트에 이 패턴을 적용할 때 참고하는 설계 문서.

---

## 전체 구조 개요

```
JIRA 티켓
  └─ [skill: jira-fetch]       → 티켓 분석, SDD 작성
  └─ [사용자 승인 게이트]
  └─ [skill: layer-implement]  → 레이어별 구현 (병렬/순차)
  └─ [skill: layer-test]       → 레이어별 단위 테스트 작성
  └─ [skill: code-review]      → 코드 리뷰 (최대 2회 자동 순환)
  └─ [사용자 승인 게이트]
  └─ [skill: git-pr]           → commit + PR 생성
  └─ [skill: notify]           → JIRA/Slack 작업 상황 공유
```

각 박스가 하나의 skill이며, 독립적으로 교체 가능하다.

---

## Skill 파일 구조

모든 skill은 동일한 디렉토리 구조를 따른다:

```
.claude/skills/{skill-name}/
├── SKILL.md               # skill 진입점 — Claude가 이 파일을 읽고 실행
└── references/
    └── patterns.md        # 코드 패턴 및 예시 모음 (SKILL.md에서 참조)
```

### SKILL.md 필수 섹션

```markdown
---
name: {skill-name}
description: "{언제 이 skill을 써야 하는지 한 줄. 키워드: 트리거 단어들}"
---

# {Skill 제목}

## 트리거
- 이 skill이 발동되어야 하는 상황 목록

## 구현 워크플로우
1. 첫 번째 단계
2. 두 번째 단계
...

## 체크리스트
- [ ] 완료 기준 항목들

## 패턴 참조
→ `references/patterns.md`
```

**description 필드**가 가장 중요하다. Claude Code가 이 텍스트로 skill의 관련성을 판단하므로, 사용자가 자연어로 입력할 법한 키워드를 포함시킨다.

---

## 카테고리 1 — 레이어 구현/테스트 Skill

프레임워크/언어별로 레이어마다 구현 skill과 테스트 skill을 쌍으로 만든다.

### 구성 원칙

| 레이어 | 구현 Skill | 테스트 Skill |
|--------|-----------|------------|
| DTO / Schema | `{framework}-dto-implement` | `{framework}-dto-test` |
| Service / UseCase | `{framework}-service-implement` | `{framework}-service-test` |
| Controller / Handler | `{framework}-controller-implement` | `{framework}-controller-test` |
| Repository / DAO | `{framework}-repository-implement` | `{framework}-repository-test` |
| Module / Container | `{framework}-module-implement` | — |
| Worker / Consumer | `{framework}-worker-implement` | `{framework}-worker-test` |

- `{framework}` 자리에 `nestjs`, `fastapi`, `spring` 등 실제 프레임워크 이름을 넣는다.
- Module은 DI 컨테이너 설정이므로 테스트 skill이 불필요한 경우가 많다.

### 구현 Skill SKILL.md 핵심 섹션

```markdown
## 구현 워크플로우

1. **의존성 파악** — 이 레이어가 inject받는 외부 요소 목록 확인
2. **DI 선언** — 생성자 또는 함수 파라미터에 의존성 주입 선언
3. **메서드 구현** — 각 메서드는 단일 책임, DB 조회 → 검증 → 상태 변경 → 반환 순서
4. **예외 처리** — 프레임워크 내장 예외 타입 사용 (Not Found, Conflict, BadRequest...)
5. **반환 타입** — 필요한 필드만 반환, 민감 정보 제외

## 체크리스트
- [ ] 프레임워크 필수 데코레이터/어노테이션 선언
- [ ] 모든 의존성 불변(readonly/final) 주입
- [ ] 메서드당 단일 책임
- [ ] DB 조회 실패 시 적절한 프레임워크 예외 throw
- [ ] 저장 시 엔티티 생성 → 저장 분리 패턴
```

### 테스트 Skill SKILL.md 핵심 섹션

```markdown
## 구현 워크플로우

1. **의존성 파악** — 테스트 대상의 constructor/생성자 의존성 목록 확인
2. **mock 선언** — 파일 상단(describe 바깥)에 사용하는 메서드만 포함
3. **TestingModule 설정** — beforeEach에서 mock 주입
4. **테스트 케이스**
   - Happy path: 정상 흐름
   - Not Found: 리소스 없음 (DB 조회 null 반환 시)
   - Error: 외부 의존성 실패 시 예외 전파

## 체크리스트
- [ ] mock은 describe 바깥, 실제 사용 메서드만 선언
- [ ] beforeEach에서 jest.clearAllMocks() 호출
- [ ] DB 저장 호출 인자를 expect(mock.save).toHaveBeenCalledWith(...)로 검증
- [ ] 예외 케이스는 rejects.toThrow()로 검증
```

### patterns.md 구성 요령

구현 패턴을 번호 섹션으로 나눈다:

```markdown
# {레이어} 구현 패턴

## 1. 기본 골격
{가장 단순한 완전한 예시 코드}

## 2. 비동기/특수 패턴
{큐, 스트림, 배치 처리 등}

## 3. 에러 처리 패턴
{각 예외 타입별 처리 예시}

## 4. 테스트 mock 패턴
{이 레이어를 mock할 때 참조}
```

---

## 카테고리 2 — JIRA Ticket Fetch Skill

### 역할

JIRA MCP를 통해 티켓을 조회하고 구현에 필요한 컨텍스트를 구성한다.

### SKILL.md 구조

```markdown
---
name: jira-fetch
description: "JIRA 티켓을 조회해 요구사항을 분석하고 SDD(Software Design Document)를 작성한다. 키워드: 티켓 분석, JIRA, 요구사항 파악, SDD 작성, 구현 계획"
---

# JIRA Ticket Fetch & SDD 작성

## 트리거
- 새 티켓 기반 개발 시작
- 사용자가 티켓 ID를 제공할 때

## 구현 워크플로우

1. **티켓 조회** — JIRA MCP로 티켓 상세 조회
   - Title, Description, Acceptance Criteria
   - 연결된 이슈(Blocks / Blocked by / Relates to)
   - 레이블, 컴포넌트, 담당자 정보

2. **컨텍스트 분석**
   - 변경이 필요한 레이어/파일 목록 추출
   - 인터페이스 변경 여부 판단
   - DB 스키마 변경 필요 여부 판단

3. **SDD 작성** — 다음 항목 포함
   - 변경 대상 레이어 및 파일 목록
   - API / 인터페이스 변경 사항
   - DB 스키마 변경 여부
   - 테스트 전략 (단위/통합)
   - 예상 사이드 이펙트

4. **사용자 승인 요청** — SDD 확정 전 구현 시작 금지

## 체크리스트
- [ ] 티켓 Acceptance Criteria를 SDD에 반영
- [ ] 변경 파일 목록이 SDD에 명시됨
- [ ] DB 마이그레이션 필요 여부 명시
- [ ] 사용자 승인 게이트 포함
```

### MCP 설정 (settings.json)

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-jira"],
      "env": {
        "JIRA_BASE_URL": "https://your-org.atlassian.net",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}",
        "JIRA_USER_EMAIL": "${JIRA_USER_EMAIL}"
      }
    }
  }
}
```

### patterns.md 핵심 패턴

```markdown
## JIRA MCP 호출 패턴

티켓 조회: `jira_get_issue(issue_key: "PROJECT-1234")`
코멘트 추가: `jira_add_comment(issue_key, body)`
상태 전환: `jira_transition_issue(issue_key, transition_id)`

## SDD 템플릿

### 변경 레이어
- [ ] DTO: `src/feature/dto/`
- [ ] Service: `src/feature/feature.service.ts`
- [ ] Controller: `src/feature/feature.controller.ts`

### API 변경
| Method | Path | 변경 내용 |
|--------|------|---------|
| POST | /features | 신규 |

### DB 변경
없음 / `ALTER TABLE ... ADD COLUMN ...`

### 테스트 전략
- 단위: Service, Controller 각 mock 기반
- 통합: 없음 / `src/feature/feature.e2e.spec.ts`
```

---

## 카테고리 3 — Code Review Skill

### 역할

구현된 코드를 독립적 관점에서 검토하고, 이슈 발견 시 최대 2회까지 자동 수정 순환한다.

### SKILL.md 구조

```markdown
---
name: code-review
description: "구현된 코드를 리뷰한다. 버그, 보안 취약점, 불필요한 복잡성을 검토한다. 키워드: 코드 리뷰, review, 버그 검토, 보안, 리팩토링 제안"
---

# Code Review

## 트리거
- 구현 완료 후 커밋/PR 전 리뷰 요청
- `레이어 구현 skill` 완료 직후 자동 호출

## 구현 워크플로우

1. **변경 파일 파악** — `git diff main...HEAD` 또는 SDD의 파일 목록
2. **리뷰 체크리스트 순서대로 검토**
   - 정확성: 로직 버그, 엣지 케이스 누락
   - 보안: SQL Injection, XSS, 인증/인가 누락
   - 단순성: 불필요한 추상화, 중복 코드
   - 테스트: mock이 실제 동작을 반영하는지
3. **결과 분류**
   - PASS: 이슈 없음 → git-pr skill로 진행
   - PASS WITH COMMENTS: 경미한 이슈 → 코멘트 첨부 후 진행
   - FAIL: 수정 필요 → 수정 후 재리뷰 (최대 2회)
4. **2회 초과 또는 의견 불일치** → 사용자 에스컬레이션

## 자동 순환 규칙
- FAIL 시 수정 → 재리뷰는 최대 **2회**
- 2회 초과: 사용자에게 이슈 목록과 함께 판단 위임
- DISAGREE (Claude가 리뷰 이슈에 동의하지 않을 때): 사용자 판단 요청

## 체크리스트

### 정확성
- [ ] null/undefined 체크 누락 없음
- [ ] 비동기 await 누락 없음
- [ ] 트랜잭션 경계 올바름

### 보안
- [ ] SQL Injection: raw query 사용 시 파라미터 바인딩 확인
- [ ] 인증/인가: 보호가 필요한 엔드포인트에 Guard 적용
- [ ] 민감 정보: 로그/응답에 password, token 미포함

### 단순성
- [ ] 한 번만 쓰이는 로직에 불필요한 추상화 없음
- [ ] 200줄 이상의 메서드는 분리 제안
- [ ] 불필요한 주석(무엇을 하는지) 없음
```

---

## 카테고리 4 — Git Push / PR Skill

### 역할

코드 리뷰 승인 후 commit, push, PR 생성을 자동화한다.

### SKILL.md 구조

```markdown
---
name: git-pr
description: "변경사항을 commit하고 PR을 생성한다. 키워드: git commit, push, PR 생성, pull request, 브랜치 푸시"
---

# Git Push & PR 생성

## 트리거
- 코드 리뷰 PASS 후 사용자 승인 시
- 사용자가 "커밋해줘", "PR 올려줘"라고 요청할 때

## 구현 워크플로우

1. **사전 확인**
   - `git status` — unstaged 파일 확인
   - `git diff` — 변경 내용 최종 확인
   - 테스트 통과 여부 확인 (`npm test` / `pytest` 등)

2. **커밋**
   - 메시지 형식: `{TICKET-ID}: {변경 이유 요약}`
   - 사용자 승인 없이 커밋하지 않는다

3. **브랜치 push**
   - `git push -u origin {branch-name}`

4. **PR 생성** — `gh pr create`
   - 제목: `{TICKET-ID}: {변경 내용 한 줄}`
   - 본문 포함 항목: JIRA 링크, 변경 요약, 테스트 체크리스트

## PR 본문 템플릿

```markdown
## Summary
- {변경 내용 bullet}

## JIRA
{TICKET-ID} 링크

## Test plan
- [ ] {테스트 항목}

## 체크리스트
- [ ] 단위 테스트 통과
- [ ] 타입 에러 없음
```

## 체크리스트
- [ ] 커밋 전 사용자 승인 획득
- [ ] force push 사용 안 함
- [ ] PR 본문에 JIRA 티켓 링크 포함
- [ ] 민감 파일(.env 등) 미포함 확인
```

### 브랜치 전략 patterns.md

```markdown
## 브랜치 네이밍
feature/{TICKET-ID}       # 기능 개발
fix/{TICKET-ID}           # 버그 수정
refactor/{TICKET-ID}      # 리팩토링

## Worktree 격리 (병렬 작업 시)
git worktree add ../{project}-{TICKET-ID} -b feature/{TICKET-ID} main

## PR 생성
gh pr create \
  --title "{TICKET-ID}: {제목}" \
  --body "$(cat <<'EOF'
## Summary
...
EOF
)"
```

---

## 카테고리 5 — 작업 상황 공유 Skill (JIRA / Slack)

### 역할

작업 완료 후 JIRA 티켓에 완료 코멘트를 달고, Slack에 작업 결과를 공유한다.

### SKILL.md 구조

```markdown
---
name: notify
description: "작업 완료 후 JIRA와 Slack에 결과를 공유한다. 키워드: JIRA 코멘트, Slack 공유, 작업 완료 알림, 상태 업데이트"
---

# 작업 상황 공유

## 트리거
- PR 생성 완료 후
- 사용자가 "공유해줘", "JIRA에 코멘트 달아줘"라고 요청할 때
- 파이프라인 마지막 단계에서 자동 호출

## 구현 워크플로우

1. **JIRA 코멘트 작성** (JIRA MCP)
   - 변경 파일 목록
   - 구현 요약 (SDD 기반)
   - 테스트 결과 (통과 케이스 수)
   - PR 링크

2. **Slack 메시지 전송** (Slack MCP)
   - 채널: 팀 채널 또는 PR 알림 채널
   - 포함 항목: 티켓 링크, PR 링크, 작업 요약 한 줄

3. **JIRA 상태 전환** (선택)
   - In Progress → In Review (PR 생성 시)
   - In Review → Done (PR merge 시)

## 체크리스트
- [ ] JIRA 코멘트에 PR 링크 포함
- [ ] Slack 메시지에 티켓 번호 포함
- [ ] 사용자가 확인하지 못한 채널에 전송하지 않음 (사전 확인)
```

### MCP 설정 (settings.json)

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
      }
    }
  }
}
```

### patterns.md 핵심 패턴

```markdown
## JIRA 코멘트 템플릿

**작업 완료 요약**

| 항목 | 내용 |
|------|------|
| PR | {PR URL} |
| 변경 파일 수 | {N}개 |
| 테스트 | {N}개 통과 |

**변경 파일 목록**
- `src/feature/feature.service.ts`
- `src/feature/feature.controller.ts`

---

## Slack 메시지 템플릿

:white_check_mark: *{TICKET-ID}* 구현 완료
> {변경 내용 한 줄 요약}
PR: {PR URL}
JIRA: {TICKET URL}
```

---

## 새 프로젝트 적용 체크리스트

### 1단계 — 레이어 skill 결정

```
프로젝트 프레임워크는? (NestJS / FastAPI / Spring / ...)
레이어 구조는? (Controller-Service-Repository / Router-Handler-Model / ...)
각 레이어마다 implement + test skill 쌍 생성
```

### 2단계 — 외부 통합 skill 결정

```
이슈 트래커: JIRA / GitHub Issues / Linear / Notion
알림 채널: Slack / Teams / Discord
코드 호스팅: GitHub / GitLab / Bitbucket
```

### 3단계 — skill 파일 생성

각 skill 디렉토리:

```
.claude/skills/
├── {framework}-{layer}-implement/
│   ├── SKILL.md
│   └── references/patterns.md
├── {framework}-{layer}-test/
│   ├── SKILL.md
│   └── references/patterns.md
├── jira-fetch/
│   ├── SKILL.md
│   └── references/patterns.md
├── code-review/
│   ├── SKILL.md
│   └── references/patterns.md
├── git-pr/
│   ├── SKILL.md
│   └── references/patterns.md
└── notify/
    ├── SKILL.md
    └── references/patterns.md
```

### 4단계 — skills_reference.md 작성

`.claude/docs/skills_reference.md`에 전체 파이프라인 흐름을 명시한다.
이 파일이 Main Claude가 어떤 순서로 skill을 조합할지 알 수 있는 **마스터 플랜**이다.

```markdown
## 전체 흐름

1. jira-fetch → SDD 작성 → 사용자 승인
2. {layer}-implement + {layer}-test (레이어 순: DTO → Service → Controller → Module)
3. code-review (최대 2회 자동 순환)
4. git-pr → 사용자 승인
5. notify → JIRA 코멘트 + Slack

## 레이어 구현 순서

DTO → Service (test) → Controller (test) → Module → Worker (test)
```

### 5단계 — settings.json에 MCP 등록

```json
{
  "mcpServers": {
    "jira": { ... },
    "slack": { ... }
  }
}
```

---

## 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **사용자 게이트 3곳** | SDD 승인 → Commit 승인 → PR/공유 승인. 이 3곳에서만 사람이 개입 |
| **skill은 단일 책임** | 하나의 skill은 하나의 레이어 또는 하나의 외부 통합만 담당 |
| **재리뷰 상한** | code-review 자동 순환은 최대 2회. 초과 시 에스컬레이션 |
| **description이 핵심** | SKILL.md의 description 필드에 트리거 키워드를 충분히 포함시킨다 |
| **patterns.md 분리** | 코드 패턴은 SKILL.md가 아닌 patterns.md에 위치. SKILL.md는 워크플로우만 |
| **skills_reference.md** | 파이프라인 조합 순서를 문서화하는 마스터 플랜 파일 |
