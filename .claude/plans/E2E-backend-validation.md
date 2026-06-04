# 백엔드 E2E 파이프라인 검증 스크립트 플랜

## Context

백엔드 파이프라인 로직(Phase 1→2→3→4)이 실제로 동작하는지 로컬 Docker 환경에서 검증한다.
코드 생성 결과(S3, GitHub repo)는 사용자가 직접 확인하며, 스크립트는 전체 흐름을 자동 실행하고 로그를 수집한다.

- 실행 방식: `npm run e2e` (ts-node 독립 스크립트)
- 인증: `apps/backend/.env.e2e`에 `GITHUB_TOKEN`, `CLAUDE_API_KEY` 저장 (gitignore 추가)
- 시나리오 정의: `apps/backend/scripts/e2e-scenarios.json` (코드 수정 없이 시나리오 추가/변경 가능)
- 로그 출력: 콘솔 + `apps/backend/logs/e2e-{scenarioId}-{timestamp}.log`

---

## 생성 파일

```
apps/backend/
├── scripts/
│   ├── e2e-runner.ts         # 메인 실행 스크립트
│   └── e2e-scenarios.json    # 시나리오 정의
└── logs/                     # 로그 출력 디렉토리 (gitignore)
```

### .gitignore 추가 대상
```
.env.e2e
apps/backend/logs/
logs/
```

---

## 시나리오 (`e2e-scenarios.json`)

4개 시나리오: TypeScript·Java·Python 3가지 스택, 피드백 없는 케이스 2개 / 있는 케이스 2개.

```json
[
  {
    "id": "S1",
    "name": "TypeScript — Todo 앱 (피드백 없음)",
    "projectName": "ts-todo-app",
    "requirements": "사용자가 할 일을 추가, 완료 체크, 삭제할 수 있는 Todo 앱. 태그별 필터링, 마감일 설정, 완료된 항목 일괄 삭제 기능 포함. 사용자 계정 없음.",
    "techStack": {
      "language": "TypeScript",
      "backend": ["NestJS", "PostgreSQL", "TypeORM"],
      "frontend": ["React", "TypeScript", "Tailwind CSS"]
    },
    "feedback": null,
    "isPrivate": false
  },
  {
    "id": "S2",
    "name": "Java — 개인 블로그 플랫폼 (피드백 1회)",
    "projectName": "java-blog-platform",
    "requirements": "마크다운 에디터 기반 개인 블로그. 게시글 작성/수정/삭제, 태그 분류, 검색 기능. 관리자 비밀번호로만 글 작성 가능하며 방문자는 읽기 전용. 게시글별 조회수 카운트.",
    "techStack": {
      "language": "Java",
      "backend": ["Spring Boot", "PostgreSQL", "JPA/Hibernate"],
      "frontend": ["React", "TypeScript", "Tailwind CSS"],
      "build": "Gradle"
    },
    "feedback": "ERD에 댓글 기능(comments 테이블)도 추가해주세요. 댓글 작성은 이름과 내용만 받는 비회원 방식으로.",
    "isPrivate": true
  },
  {
    "id": "S3",
    "name": "Python — 실시간 채팅 앱 (피드백 없음)",
    "projectName": "python-realtime-chat",
    "requirements": "익명 사용자가 채팅방을 생성하고 실시간으로 메시지를 주고받는 앱. 닉네임 입력 후 채팅방 참여, WebSocket 기반 실시간 메시지 전송, 채팅방 목록 조회, 채팅 히스토리 저장(최근 100개).",
    "techStack": {
      "language": "Python",
      "backend": ["FastAPI", "PostgreSQL", "SQLAlchemy", "WebSocket"],
      "frontend": ["React", "TypeScript", "Socket.IO Client"]
    },
    "feedback": null,
    "isPrivate": false
  },
  {
    "id": "S4",
    "name": "TypeScript — 북마크 관리 서비스 (피드백 1회)",
    "projectName": "ts-bookmark-manager",
    "requirements": "URL 북마크를 저장하고 태그로 분류하는 서비스. 북마크 추가 시 URL에서 제목/설명/썸네일 자동 추출(og:meta), 컬렉션(폴더) 생성, 태그 기반 검색, 공유 링크 생성 기능.",
    "techStack": {
      "language": "TypeScript",
      "backend": ["NestJS", "PostgreSQL", "TypeORM", "Redis"],
      "frontend": ["React", "TypeScript", "Zustand"]
    },
    "feedback": "공유 링크는 만료 기간(7일/30일/영구)을 설정할 수 있어야 합니다. API 스펙에 만료 기간 파라미터도 추가해주세요.",
    "isPrivate": false
  }
]
```

---

## e2e-runner.ts 구조

### 타입 정의

```typescript
interface Scenario {
  id: string;
  name: string;
  projectName: string;
  requirements: string;
  techStack: Record<string, unknown>;
  feedback: string | null;
  isPrivate: boolean;
}

interface SseEvent {
  type: string;
  phase?: string;
  analysisDocumentId?: string;
  pipelineRunId?: string;
  taskId?: string;
  taskName?: string;
  githubRepoUrl?: string;
  message?: string;
  timestamp: string;
}
```

### Logger 클래스

```typescript
class Logger {
  private lines: string[] = [];

  log(level: 'INFO' | 'ERROR', message: string) {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    this.lines.push(line);
    console.log(line);
  }

  info(msg: string) { this.log('INFO', msg); }
  error(msg: string) { this.log('ERROR', msg); }

  saveToFile(scenarioId: string) {
    const filename = `logs/e2e-${scenarioId}-${Date.now()}.log`;
    fs.mkdirSync('logs', { recursive: true });
    fs.writeFileSync(filename, this.lines.join('\n') + '\n');
    console.log(`로그 저장: ${filename}`);
  }
}
```

### SSE 대기 함수

Node 18+ 내장 fetch로 SSE 스트림 파싱 (외부 패키지 불필요):

```typescript
async function waitForSseEvent(
  projectId: string,
  targetTypes: string[],   // ['phase_completed', 'pipeline_failed'] 등
  targetPhase: string | undefined,
  logger: Logger,
  timeoutMs = 600_000,
): Promise<SseEvent> {
  const url = `${BASE_URL}/pipeline/${projectId}/stream`;
  const res = await fetch(url);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reader.cancel();
      reject(new Error(`SSE 타임아웃 ${timeoutMs}ms — projectId=${projectId}`));
    }, timeoutMs);

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;
            const event: SseEvent = JSON.parse(dataLine.slice(6));
            logger.info(`SSE 수신 — ${JSON.stringify(event)}`);
            if (
              targetTypes.includes(event.type) &&
              (!targetPhase || event.phase === targetPhase)
            ) {
              clearTimeout(timer);
              reader.cancel();
              resolve(event);
              return;
            }
          }
        }
        reject(new Error('SSE 스트림 종료 (이벤트 미수신)'));
      } catch (e) {
        reject(e);
      }
    })();
  });
}
```

### HTTP 헬퍼

```typescript
async function post(path: string, body: unknown, sessionId?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['x-session-id'] = sessionId;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} 실패: ${res.status} ${await res.text()}`);
  return res.json();
}
```

### 시나리오 실행 흐름

```
1. POST /session → sessionId
2. POST /projects → projectId
3. POST /pipeline/:projectId/start (x-session-id) → pipelineRunId
4. SSE 대기: phase_completed PHASE_1 → analysisDocumentId 획득
5. (피드백 있으면) POST /pipeline/:projectId/feedback → SSE phase_completed PHASE_1 재대기
6. POST /pipeline/:projectId/confirm { analysisDocumentId } (x-session-id)
7. SSE 대기: pipeline_completed | pipeline_failed
8. 로그 저장
```

**주의**: 단계 4와 6은 같은 SSE 스트림을 연속으로 구독하지 않아도 된다.
각 `waitForSseEvent` 호출이 새 SSE 커넥션을 열어 해당 이벤트를 기다린다.
(BullMQ Worker가 파이프라인을 비동기로 처리하므로 재연결해도 Redis pub/sub으로 이벤트를 수신할 수 있다.)

### CLI 인수

```bash
npm run e2e                   # 전체 시나리오 순차 실행
npm run e2e -- --scenario=S1  # 특정 시나리오만 실행
```

---

## package.json 추가 스크립트

`apps/backend/package.json`의 `scripts`에 추가:

```json
"e2e": "ts-node -r tsconfig-paths/register scripts/e2e-runner.ts",
```

---

## .env.e2e 형식 (사용자 작성)

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxx
E2E_BASE_URL=http://localhost:3001/v1
```

---

## 실행 순서

1. `docker-compose up -d` — Postgres, Redis, LocalStack 시작
2. `cd apps/backend && npm run dev` — 백엔드 서버 시작 (별도 터미널)
3. `apps/backend/.env.e2e` 파일 작성
4. `cd apps/backend && npm run e2e -- --scenario=S1` (단일 시나리오 먼저 검증)
5. 로그 확인: `cat apps/backend/logs/e2e-S1-{timestamp}.log`
6. GitHub repo URL 접속 → 파일 구조 확인 (사용자 직접)

---

## 검증 기준 (사용자 확인 항목)

- 로그에 `pipeline_completed` + `githubRepoUrl` 이벤트 수신 확인
- GitHub repo 접속 → 생성된 파일 구조 검토
- `apps/backend/logs/` 의 SSE 이벤트 흐름 전체 확인
- 피드백 시나리오(S2, S4): Phase 1이 2회 실행됐는지 로그 확인
