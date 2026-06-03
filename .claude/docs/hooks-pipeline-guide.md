# Claude Code Hooks 기반 파이프라인 강화 — 추상화 가이드

Agent/Skill 파이프라인에 Hooks를 결합해 규칙 강제·자동 검증·알림을 시스템 수준에서 처리하는 설계 문서.
다른 프로젝트에 이식할 때 참고한다.

---

## Hooks란

Claude Code가 특정 이벤트를 발생시킬 때 **하네스(시스템)가 자동으로 실행하는 shell 명령**이다.
Claude 자신이 "실행해야겠다"고 판단하는 것이 아니라, 이벤트가 발생하면 무조건 실행된다.

| Hook 이벤트 | 발동 시점 | exit code 0 아니면 |
|------------|---------|------------------|
| `PreToolUse` | 도구 실행 **직전** | 해당 도구 호출 **차단** |
| `PostToolUse` | 도구 실행 **직후** | 경고 출력 (실행은 완료) |
| `Notification` | Claude가 알림을 보낼 때 | — |
| `Stop` | Claude가 응답을 **종료**할 때 | — |

**핵심 특성**:
- `PreToolUse`에서 exit 1을 반환하면 해당 도구 호출이 취소된다 → **강제(enforcement)** 용도
- Hook의 stdout은 Claude의 컨텍스트로 주입된다 → Claude가 결과를 읽고 다음 행동을 결정한다
- Hook은 Claude가 아닌 시스템이 실행하므로, Claude가 "잊어버리거나" "건너뛸" 수 없다

---

## Hooks vs Agent/Skill 역할 분리

| 구분 | Hooks | Agent / Skill |
|------|-------|--------------|
| **실행 주체** | 시스템(하네스) | Claude |
| **트리거** | 이벤트 자동 발동 | Orchestrator 디스패치 |
| **맥락 보유** | 없음 (stateless) | 있음 (컨텍스트 유지) |
| **적합한 역할** | 규칙 강제, 즉각 검증, 부수효과 | 맥락 있는 판단, 복잡한 조합 |
| **예시** | 파일 저장 → lint 자동 실행 | PR 생성 후 → JIRA 요약 코멘트 작성 |

**판단 기준**: "Claude가 판단해야 하는가?" → Agent/Skill  
**판단 기준**: "규칙이라서 항상 실행되어야 하는가?" → Hook

---

## 파이프라인 × Hooks 매핑

```
[Orchestrator]
  jira-fetch → SDD 작성 → 사용자 승인
        │
        ▼
[TDD Worker Agent × N]
  ┌─ Write *.spec.ts ──────────────────────── PostToolUse ①
  │    테스트 자동 실행 → Red 상태 확인
  │
  ├─ Write *.ts (impl) ────────────────────── PreToolUse  ②  ← *.spec.ts 존재 강제
  │    테스트 자동 실행 → Green 상태 확인 ── PostToolUse ①
  │
  └─ Edit 후 저장 ─────────────────────────── PostToolUse ③  ← lint 자동 실행
        │
        ▼
[Review Agent]
  코드 리뷰 → PASS
        │
        ▼
[Git-PR Agent]
  git commit ──────────────────────────────── PreToolUse  ④  ← 전체 테스트 통과 강제
  git push / gh pr ───────────────────────── PreToolUse  ⑤  ← force push 차단
        │
        ▼
[Notify Agent]
  JIRA + Slack 공유 ──────────────────────── Stop        ⑥  ← 간단 알림 자동 발송
```

---

## Hook 포인트 상세 정의

### ① 테스트 자동 실행 (`PostToolUse` — Write/Edit)

**목적**: 파일 저장 직후 관련 테스트를 실행해 Red/Green 상태를 즉시 Claude에게 피드백한다.  
**효과**: TDD Worker Agent가 별도로 "테스트 실행" 단계를 지시하지 않아도 자동으로 결과를 받는다.

```json
{
  "PostToolUse": [{
    "matcher": "Write|Edit",
    "hooks": [{
      "type": "command",
      "command": "bash .claude/hooks/run-related-tests.sh '$CLAUDE_TOOL_INPUT'"
    }]
  }]
}
```

**hook 스크립트 로직**:
```bash
# run-related-tests.sh
# 1. 저장된 파일 경로 추출
# 2. *.service.ts → *.service.spec.ts 대응 파일 찾기
# 3. spec 파일이 존재하면 해당 테스트만 실행
# 4. 결과(통과/실패 수)를 stdout 출력 → Claude 컨텍스트로 주입
FILE=$(echo "$1" | jq -r '.path // .file_path')
SPEC="${FILE%.ts}.spec.ts"
[ -f "$SPEC" ] && npx jest "$SPEC" --no-coverage 2>&1 | tail -5
```

**프레임워크별 테스트 명령 교체**:
| 프레임워크 | 명령 |
|-----------|------|
| NestJS / Jest | `npx jest {spec}` |
| FastAPI / pytest | `pytest {test_file} -v` |
| Spring / JUnit | `./mvnw test -pl {module}` |
| Go | `go test ./... -run {TestName}` |

---

### ② TDD 순서 강제 (`PreToolUse` — Write)

**목적**: 구현 파일을 테스트 파일보다 먼저 작성하려는 시도를 차단한다.  
**효과**: TDD Worker Agent가 실수로 순서를 바꾸더라도 시스템이 강제한다.

```json
{
  "PreToolUse": [{
    "matcher": "Write",
    "hooks": [{
      "type": "command",
      "command": "bash .claude/hooks/enforce-tdd-order.sh '$CLAUDE_TOOL_INPUT'"
    }]
  }]
}
```

**hook 스크립트 로직**:
```bash
# enforce-tdd-order.sh
# 1. 작성하려는 파일이 구현 파일인지 확인 (*.ts, *.py, *.go ... *.spec 제외)
# 2. 대응하는 테스트 파일이 존재하는지 확인
# 3. 존재하지 않으면 exit 1 → Write 차단 + 메시지 출력
FILE=$(echo "$1" | jq -r '.path // .file_path')
if [[ "$FILE" =~ \.(ts|py|go|java)$ ]] && [[ ! "$FILE" =~ \.(spec|test)\. ]]; then
  SPEC=$(echo "$FILE" | sed 's/\.\(ts\|py\|go\|java\)$/.spec.\1/')
  if [ ! -f "$SPEC" ]; then
    echo "TDD 위반: $SPEC 를 먼저 작성해야 합니다."
    exit 1
  fi
fi
```

**프로젝트별 파일 패턴 조정**:
| 언어 | 구현 파일 | 테스트 파일 |
|-----|---------|----------|
| TypeScript | `*.ts` | `*.spec.ts` |
| Python | `*.py` | `test_*.py` |
| Go | `*.go` | `*_test.go` |
| Java | `*.java` | `*Test.java` |

---

### ③ 파일 저장 시 lint 자동 실행 (`PostToolUse` — Write/Edit)

**목적**: Review Agent가 돌기 전에 포맷·스타일 이슈를 자동으로 제거한다.  
**효과**: Review Agent가 포맷 지적 대신 로직 리뷰에 집중할 수 있다.

```json
{
  "PostToolUse": [{
    "matcher": "Write|Edit",
    "hooks": [{
      "type": "command",
      "command": "bash .claude/hooks/auto-lint.sh '$CLAUDE_TOOL_INPUT'"
    }]
  }]
}
```

**hook 스크립트 로직**:
```bash
# auto-lint.sh
FILE=$(echo "$1" | jq -r '.path // .file_path')
case "$FILE" in
  *.ts|*.tsx) npx eslint --fix "$FILE" 2>&1 ;;
  *.py)       ruff check --fix "$FILE" 2>&1 ;;
  *.go)       gofmt -w "$FILE" 2>&1 ;;
  *.java)     # google-java-format 등 프로젝트 설정에 따라 추가
esac
```

---

### ④ commit 전 전체 테스트 통과 강제 (`PreToolUse` — Bash)

**목적**: 테스트가 실패한 상태로 commit되는 것을 차단한다.  
**효과**: Git-PR Agent가 "테스트 통과 확인" 단계를 별도로 실행하지 않아도 자동 보장된다.

```json
{
  "PreToolUse": [{
    "matcher": "Bash",
    "hooks": [{
      "type": "command",
      "command": "bash .claude/hooks/pre-commit-guard.sh '$CLAUDE_TOOL_INPUT'"
    }]
  }]
}
```

**hook 스크립트 로직**:
```bash
# pre-commit-guard.sh
CMD=$(echo "$1" | jq -r '.command')
if echo "$CMD" | grep -q "git commit"; then
  echo "commit 전 테스트 실행 중..."
  npm test --silent 2>&1
  if [ $? -ne 0 ]; then
    echo "테스트 실패 — commit 차단. 테스트를 통과시킨 후 다시 시도하세요."
    exit 1
  fi
fi
```

**프레임워크별 테스트 명령 교체**: `npm test` → `pytest` / `go test ./...` / `./mvnw test`

---

### ⑤ 위험한 git 명령 차단 (`PreToolUse` — Bash)

**목적**: `git push --force`, `git reset --hard`, `git clean -f` 등 되돌리기 어려운 명령을 자동 차단한다.  
**효과**: Git-PR Agent가 실수로 위험 명령을 실행하는 것을 시스템이 방지한다.

```json
{
  "PreToolUse": [{
    "matcher": "Bash",
    "hooks": [{
      "type": "command",
      "command": "bash .claude/hooks/dangerous-git-guard.sh '$CLAUDE_TOOL_INPUT'"
    }]
  }]
}
```

**hook 스크립트 로직**:
```bash
# dangerous-git-guard.sh
CMD=$(echo "$1" | jq -r '.command')
BLOCKED_PATTERNS=("push --force" "push -f" "reset --hard" "clean -f" "branch -D")
for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -q "$pattern"; then
    echo "위험 명령 차단: '$pattern' — 사용자 확인이 필요합니다."
    exit 1
  fi
done
```

---

### ⑥ 파이프라인 종료 시 간단 알림 (`Stop`)

**목적**: Claude가 응답을 마칠 때 간단한 완료 신호를 외부로 전송한다.  
**효과**: Notify Agent가 맥락 있는 JIRA 코멘트를 작성하기 전, 시스템 수준의 즉각 알림을 제공한다.

```json
{
  "Stop": [{
    "hooks": [{
      "type": "command",
      "command": "bash .claude/hooks/notify-on-stop.sh"
    }]
  }]
}
```

**hook 스크립트 로직**:
```bash
# notify-on-stop.sh
# 예: 터미널 벨 알림 / macOS 알림 / 간단 Slack ping
osascript -e 'display notification "Claude 작업 완료" with title "Claude Code"'
# 또는
# curl -s -X POST "$SLACK_WEBHOOK_URL" -d '{"text":"Claude 작업 종료"}' > /dev/null
```

> **주의**: Stop Hook은 작업이 완료됐는지 여부와 관계없이 발동한다.
> 맥락이 있는 완료 보고(PR 링크, 테스트 결과 요약 등)는 Notify Agent가 담당한다.

---

## settings.json 전체 예시

`.claude/settings.json`에 추가한다.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/enforce-tdd-order.sh '$CLAUDE_TOOL_INPUT'"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-commit-guard.sh '$CLAUDE_TOOL_INPUT'"
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/dangerous-git-guard.sh '$CLAUDE_TOOL_INPUT'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/auto-lint.sh '$CLAUDE_TOOL_INPUT'"
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/run-related-tests.sh '$CLAUDE_TOOL_INPUT'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/notify-on-stop.sh"
          }
        ]
      }
    ]
  }
}
```

---

## 디렉토리 구조

```
.claude/
├── hooks/
│   ├── enforce-tdd-order.sh      # ② TDD 순서 강제
│   ├── run-related-tests.sh      # ① 테스트 자동 실행
│   ├── auto-lint.sh              # ③ lint 자동 실행
│   ├── pre-commit-guard.sh       # ④ commit 전 테스트 강제
│   ├── dangerous-git-guard.sh    # ⑤ 위험 git 명령 차단
│   └── notify-on-stop.sh         # ⑥ 종료 알림
└── settings.json                 # Hook 이벤트 → 스크립트 연결
```

모든 스크립트는 프로젝트 루트 기준 상대 경로로 실행된다.  
실행 권한 부여: `chmod +x .claude/hooks/*.sh`

---

## 새 프로젝트 적용 체크리스트

```
[ ] 1. .claude/hooks/ 디렉토리 생성
[ ] 2. 프레임워크에 맞게 스크립트 내 언어/명령 교체
       - 테스트 명령: npm test → pytest / go test / ./mvnw test
       - lint 명령: eslint → ruff / gofmt / checkstyle
       - 파일 확장자 패턴: .ts → .py / .go / .java
[ ] 3. .claude/settings.json에 hooks 블록 추가
[ ] 4. 스크립트 실행 권한 부여 (chmod +x)
[ ] 5. 각 Hook이 올바르게 발동하는지 수동 테스트
       - PreToolUse: .spec.ts 없이 .ts 저장 시도 → 차단 확인
       - PostToolUse: .ts 저장 후 테스트 결과 stdout 출력 확인
       - PreToolUse: git commit 시도 → 테스트 실행 후 차단/통과 확인
```

---

## 핵심 원칙 요약

| 원칙 | 설명 |
|------|------|
| **강제는 Hook으로** | 규칙(TDD 순서, commit 가드)은 Claude에게 맡기지 않고 시스템이 강제한다 |
| **피드백은 stdout으로** | Hook 결과를 stdout에 출력하면 Claude가 읽고 다음 행동을 조정한다 |
| **차단은 exit 1로** | PreToolUse에서 exit 1 반환 시 해당 도구 호출이 취소된다 |
| **단순하게 유지** | 각 Hook 스크립트는 하나의 책임만 갖는다. 복잡한 로직은 Agent에게 위임 |
| **Stop ≠ Notify Agent** | Stop Hook은 즉각적인 시그널, Notify Agent는 맥락 있는 보고. 혼용하지 않는다 |
