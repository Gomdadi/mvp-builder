/**
 * MSW 핸들러 — 백엔드 없이 프론트엔드 개발/테스트용 모의 API
 *
 * [SSE 시나리오]
 * Phase 1 자동 이동 루프 방지를 위해 SSE는 Phase 2→3→4→pipeline_completed 순으로 전송.
 * Phase 1 리뷰 테스트: /projects/mock-project-id/review?docId=mock-doc-id 직접 접근.
 *
 * [활성화]
 * .env.development에 VITE_ENABLE_MOCK=true 설정 시 자동 활성화.
 */

import { http, HttpResponse } from 'msw'
import type { AnalysisDocument, FileContent, FileNode, Project, SseEvent, Task } from '@/types/api'

// ─── 고정 Mock ID ───────────────────────────────────────────────────────────
export const MOCK_PROJECT_ID = 'mock-project-id'
export const MOCK_DOC_ID = 'mock-doc-id'
export const MOCK_RUN_ID = 'mock-run-id'

// ─── Mock 데이터 ─────────────────────────────────────────────────────────────

const MOCK_PROJECT: Project = {
  id: MOCK_PROJECT_ID,
  name: '할 일 관리 앱',
  requirements:
    '사용자가 할 일을 추가, 완료, 삭제할 수 있는 앱. 회원가입/로그인 기능 포함. JWT 인증.',
  techStack: { frontend: 'React', backend: 'NestJS', database: 'PostgreSQL' },
  status: 'COMPLETED',
  githubRepoUrl: 'https://github.com/mock-user/todo-app',
  githubRepoName: 'todo-app',
  createdAt: new Date().toISOString(),
}

const MOCK_ANALYSIS_DOC: AnalysisDocument = {
  id: MOCK_DOC_ID,
  projectId: MOCK_PROJECT_ID,
  version: 1,
  erd: `## ERD

\`\`\`mermaid
erDiagram
  User {
    uuid id PK
    string email
    string password_hash
    datetime created_at
  }
  Todo {
    uuid id PK
    uuid user_id FK
    string title
    boolean completed
    datetime created_at
    datetime updated_at
  }
  User ||--o{ Todo : "has"
\`\`\`
`,
  apiSpec: `## API 스펙

### POST /auth/register
회원가입

**Request Body**
\`\`\`json
{ "email": "user@example.com", "password": "plaintext" }
\`\`\`

**Response 201**
\`\`\`json
{ "id": "uuid", "email": "user@example.com", "createdAt": "..." }
\`\`\`

---

### POST /auth/login
로그인

**Response 200**
\`\`\`json
{ "accessToken": "eyJhbGci..." }
\`\`\`

---

### GET /todos
할 일 목록 조회 (Authorization: Bearer {token} 필요)

**Response 200**
\`\`\`json
[{ "id": "uuid", "title": "장보기", "completed": false }]
\`\`\`

---

### POST /todos
할 일 생성

**Request Body**
\`\`\`json
{ "title": "장보기" }
\`\`\`

---

### PATCH /todos/:id
할 일 수정 (제목 또는 완료 여부)

---

### DELETE /todos/:id
할 일 삭제
`,
  architecture: `## 아키텍처

### 기술 스택
| 계층 | 기술 |
|------|------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | NestJS + TypeORM + Passport JWT |
| Database | PostgreSQL 16 |
| 인프라 | Docker Compose |

### 모듈 구조

\`\`\`
backend/src/
├── auth/           # JWT 인증 (register, login, guard)
├── users/          # User 엔티티 + UsersService
├── todos/          # Todo 엔티티 + CRUD 서비스 + 컨트롤러
└── app.module.ts

frontend/src/
├── components/     # 재사용 UI 컴포넌트
├── pages/          # 라우트 페이지
├── api/            # Axios 인스턴스 + API 함수
└── store/          # Zustand (auth 상태)
\`\`\`

### 인증 플로우
1. 클라이언트 → POST /auth/login → JWT accessToken 수신
2. 이후 요청 Header: \`Authorization: Bearer {token}\`
3. NestJS JwtAuthGuard가 토큰 검증 후 req.user 주입
`,
  isConfirmed: false,
  createdAt: new Date().toISOString(),
}

const MOCK_TASKS: Task[] = [
  {
    id: 'task-1',
    name: 'User 엔티티 + UsersService',
    description: 'TypeORM User 엔티티, UsersModule, UsersRepository 구현',
    type: 'BACKEND',
    orderIndex: 1,
    status: 'PENDING',
  },
  {
    id: 'task-2',
    name: 'Todo 엔티티 + TodosService',
    description: 'TypeORM Todo 엔티티, TodosModule, CRUD 서비스 구현',
    type: 'BACKEND',
    orderIndex: 2,
    status: 'PENDING',
  },
  {
    id: 'task-3',
    name: 'AuthModule (JWT)',
    description: 'Passport JWT 전략, 로그인/회원가입 컨트롤러, JwtAuthGuard',
    type: 'BACKEND',
    orderIndex: 3,
    status: 'PENDING',
  },
  {
    id: 'task-4',
    name: 'TodosController (REST)',
    description: 'GET/POST/PATCH/DELETE /todos 엔드포인트, 인증 가드 적용',
    type: 'BACKEND',
    orderIndex: 4,
    status: 'PENDING',
  },
  {
    id: 'task-5',
    name: 'TodoList 컴포넌트',
    description: '할 일 목록 표시 및 완료 토글 UI',
    type: 'FRONTEND',
    orderIndex: 5,
    status: 'PENDING',
  },
  {
    id: 'task-6',
    name: 'LoginPage + 인증 스토어',
    description: '로그인/회원가입 페이지, Zustand auth 상태 관리',
    type: 'FRONTEND',
    orderIndex: 6,
    status: 'PENDING',
  },
]

const MOCK_FILE_TREE: FileNode[] = [
  {
    name: 'backend',
    path: 'backend',
    children: [
      {
        name: 'src',
        path: 'backend/src',
        children: [
          { name: 'app.module.ts', path: 'backend/src/app.module.ts' },
          { name: 'main.ts', path: 'backend/src/main.ts' },
          {
            name: 'auth',
            path: 'backend/src/auth',
            children: [
              { name: 'auth.module.ts', path: 'backend/src/auth/auth.module.ts' },
              { name: 'auth.service.ts', path: 'backend/src/auth/auth.service.ts' },
              { name: 'auth.controller.ts', path: 'backend/src/auth/auth.controller.ts' },
            ],
          },
          {
            name: 'todos',
            path: 'backend/src/todos',
            children: [
              { name: 'todo.entity.ts', path: 'backend/src/todos/todo.entity.ts' },
              { name: 'todos.service.ts', path: 'backend/src/todos/todos.service.ts' },
              { name: 'todos.controller.ts', path: 'backend/src/todos/todos.controller.ts' },
            ],
          },
        ],
      },
      { name: 'package.json', path: 'backend/package.json' },
    ],
  },
  {
    name: 'frontend',
    path: 'frontend',
    children: [
      {
        name: 'src',
        path: 'frontend/src',
        children: [
          { name: 'App.tsx', path: 'frontend/src/App.tsx' },
          {
            name: 'pages',
            path: 'frontend/src/pages',
            children: [
              { name: 'LoginPage.tsx', path: 'frontend/src/pages/LoginPage.tsx' },
              { name: 'TodoPage.tsx', path: 'frontend/src/pages/TodoPage.tsx' },
            ],
          },
        ],
      },
    ],
  },
  { name: 'docker-compose.yml', path: 'docker-compose.yml' },
]

// 파일별 코드 내용 (샘플 2개)
const MOCK_FILE_CONTENTS: Record<string, string> = {
  'backend/src/todos/todo.entity.ts': `import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { User } from '../users/user.entity'

@Entity('todos')
export class Todo {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  title: string

  @Column({ default: false })
  completed: boolean

  @ManyToOne(() => User, (user) => user.todos, { onDelete: 'CASCADE' })
  user: User

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
`,
  'docker-compose.yml': `version: '3.8'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: todo_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - '5432:5432'

  backend:
    build: ./backend
    depends_on: [db]
    environment:
      DATABASE_URL: postgresql://postgres:password@db:5432/todo_db
      JWT_SECRET: super-secret
    ports:
      - '3000:3000'

  frontend:
    build: ./frontend
    depends_on: [backend]
    ports:
      - '5173:5173'
`,
}

// ─── SSE 이벤트 시퀀스 (Phase 2 → Phase 3 → Phase 4 → 완료) ─────────────────
// Phase 1 완료 시 자동 이동 루프 방지를 위해 Phase 2부터 시작.
const SSE_EVENTS: SseEvent[] = [
  { type: 'phase_started', phase: 'PHASE_2', timestamp: new Date().toISOString() },
  { type: 'phase_completed', phase: 'PHASE_2', pipelineRunId: MOCK_RUN_ID, timestamp: new Date().toISOString() },
  { type: 'phase_started', phase: 'PHASE_3', timestamp: new Date().toISOString() },
  { type: 'task_started', taskId: 'task-1', taskName: 'User 엔티티 + UsersService', timestamp: new Date().toISOString() },
  { type: 'task_completed', taskId: 'task-1', taskName: 'User 엔티티 + UsersService', timestamp: new Date().toISOString() },
  { type: 'task_started', taskId: 'task-2', taskName: 'Todo 엔티티 + TodosService', timestamp: new Date().toISOString() },
  { type: 'task_completed', taskId: 'task-2', taskName: 'Todo 엔티티 + TodosService', timestamp: new Date().toISOString() },
  { type: 'task_started', taskId: 'task-3', taskName: 'AuthModule (JWT)', timestamp: new Date().toISOString() },
  { type: 'task_completed', taskId: 'task-3', taskName: 'AuthModule (JWT)', timestamp: new Date().toISOString() },
  { type: 'task_started', taskId: 'task-4', taskName: 'TodosController (REST)', timestamp: new Date().toISOString() },
  { type: 'task_completed', taskId: 'task-4', taskName: 'TodosController (REST)', timestamp: new Date().toISOString() },
  { type: 'task_started', taskId: 'task-5', taskName: 'TodoList 컴포넌트', timestamp: new Date().toISOString() },
  { type: 'task_completed', taskId: 'task-5', taskName: 'TodoList 컴포넌트', timestamp: new Date().toISOString() },
  { type: 'task_started', taskId: 'task-6', taskName: 'LoginPage + 인증 스토어', timestamp: new Date().toISOString() },
  { type: 'task_completed', taskId: 'task-6', taskName: 'LoginPage + 인증 스토어', timestamp: new Date().toISOString() },
  { type: 'phase_completed', phase: 'PHASE_3', timestamp: new Date().toISOString() },
  { type: 'phase_started', phase: 'PHASE_4', timestamp: new Date().toISOString() },
  {
    type: 'pipeline_completed',
    githubRepoUrl: 'https://github.com/mock-user/todo-app',
    timestamp: new Date().toISOString(),
  },
]

// ─── MSW 핸들러 ──────────────────────────────────────────────────────────────

export const handlers = [
  // ── Session ──
  http.post('/v1/session', () => {
    return HttpResponse.json({ sessionId: 'mock-session-id' })
  }),

  // ── Projects ──
  http.post('/v1/projects', () => {
    return HttpResponse.json(MOCK_PROJECT, { status: 201 })
  }),

  http.get('/v1/projects/:id', ({ params }) => {
    return HttpResponse.json({ ...MOCK_PROJECT, id: params.id as string })
  }),

  // 파일 트리 또는 파일 내용 — path 쿼리파람 유무로 구분
  http.get('/v1/projects/:id/files', ({ request }) => {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')

    if (filePath) {
      const content: FileContent = {
        path: filePath,
        content: MOCK_FILE_CONTENTS[filePath] ?? `// ${filePath}\n// (모의 파일 내용)\n`,
      }
      return HttpResponse.json(content)
    }

    return HttpResponse.json(MOCK_FILE_TREE)
  }),

  // ── Pipeline ──
  http.post('/v1/pipeline/:projectId/start', () => {
    return HttpResponse.json({ pipelineId: 'mock-pipeline-id', phase: 'PHASE_1', status: 'RUNNING' })
  }),

  http.post('/v1/pipeline/:projectId/confirm', () => {
    return HttpResponse.json({ pipelineId: 'mock-pipeline-id', phase: 'PHASE_2', status: 'RUNNING' })
  }),

  http.post('/v1/pipeline/:projectId/feedback', () => {
    return HttpResponse.json({ pipelineId: 'mock-pipeline-id', phase: 'PHASE_1', status: 'RUNNING' })
  }),

  // ── SSE 스트림 — 800ms 간격으로 정적 이벤트 순차 전송 ──
  http.get('/v1/pipeline/:projectId/stream', () => {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        for (const event of SSE_EVENTS) {
          await new Promise<void>((resolve) => setTimeout(resolve, 800))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        // 스트림을 닫지 않아 EventSource 자동 재연결 방지
      },
    })

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }),

  // ── Analysis Document ──
  http.get('/v1/analysis-documents/:id', () => {
    return HttpResponse.json(MOCK_ANALYSIS_DOC)
  }),

  // ── Pipeline Tasks ──
  http.get('/v1/pipeline-runs/:id/tasks', () => {
    return HttpResponse.json(MOCK_TASKS)
  }),
]
