/**
 * MSW 핸들러 — 백엔드 없이 프론트엔드 개발/테스트용 모의 API
 *
 * [SSE 시나리오]
 * S1: TypeScript — Todo 앱 (피드백 없음)
 * Phase 1 완료 후 review로 이동하고, confirm 후 Phase 2→3→4→pipeline_completed 순으로 전송.
 *
 * [활성화]
 * .env.development에 VITE_ENABLE_MOCK=true 설정 시 자동 활성화.
 */

import { http, HttpResponse } from 'msw'
import type { AnalysisDocument, FileContent, FileNode, Project, SseEvent, Task } from '@/types/api'

// ─── 고정 Mock ID ───────────────────────────────────────────────────────────
export const MOCK_PROJECT_ID = 'proj-s1-todo'
export const MOCK_DOC_ID = 'doc-s1-analysis'
export const MOCK_RUN_ID = 'run-s1-pipeline'

interface MockSseStep {
  event: SseEvent
  delayMs: number
}

// ─── Mock 데이터 ─────────────────────────────────────────────────────────────

const MOCK_PROJECT: Project = {
  id: MOCK_PROJECT_ID,
  name: 'ts-todo-app',
  requirements:
    '사용자가 할 일을 추가, 완료 체크, 삭제할 수 있는 Todo 앱. 각 Todo는 제목(title)과 완료 여부(completed)만 가진다. 사용자 계정 없음.',
  techStack: { frontend: 'React + TypeScript', backend: 'NestJS + TypeORM', database: 'PostgreSQL' },
  status: 'COMPLETED',
  githubRepoUrl: 'https://github.com/dadigom/ts-todo-app',
  githubRepoName: 'ts-todo-app',
  createdAt: new Date().toISOString(),
}

const MOCK_ANALYSIS_DOC: AnalysisDocument = {
  id: MOCK_DOC_ID,
  projectId: MOCK_PROJECT_ID,
  version: 1,
  erd: `## ERD

\`\`\`mermaid
erDiagram
  Todo {
    uuid id PK
    string title
    boolean completed
    datetime created_at
    datetime updated_at
  }
\`\`\`
`,
  apiSpec: `## API 스펙

### GET /todos
할 일 목록 조회

**Response 200**
\`\`\`json
[
  {
    "id": "uuid",
    "title": "장보기",
    "completed": false,
    "createdAt": "2026-06-05T00:00:00.000Z",
    "updatedAt": "2026-06-05T00:00:00.000Z"
  }
]
\`\`\`

---

### POST /todos
할 일 생성

**Request Body**
\`\`\`json
{ "title": "장보기" }
\`\`\`

**Response 201**
\`\`\`json
{ "id": "uuid", "title": "장보기", "completed": false }
\`\`\`

---

### PATCH /todos/:id
할 일 완료 여부 수정

**Request Body**
\`\`\`json
{ "completed": true }
\`\`\`

---

### DELETE /todos/:id
할 일 삭제
`,
  architecture: `## 아키텍처

### 기술 스택
| 계층 | 기술 |
|------|------|
| Frontend | React + TypeScript + Vite |
| Backend | NestJS + TypeScript + TypeORM |
| Database | PostgreSQL 16 |
| 인프라 | Docker Compose |

### 모듈 구조

\`\`\`
backend/src/
├── todos/          # Todo 엔티티 + CRUD 서비스 + 컨트롤러
└── app.module.ts

frontend/src/
├── api/            # Todo API client
├── components/     # Todo 입력/목록 UI
└── App.tsx         # 단일 Todo 화면
\`\`\`

### 처리 흐름
1. 클라이언트가 \`GET /todos\`로 전체 Todo를 조회한다.
2. 입력 폼에서 \`POST /todos\`로 새 Todo를 생성한다.
3. 체크박스 변경 시 \`PATCH /todos/:id\`로 완료 여부를 저장한다.
4. 삭제 버튼 클릭 시 \`DELETE /todos/:id\`로 항목을 제거한다.
`,
  isConfirmed: false,
  createdAt: new Date().toISOString(),
}

const MOCK_TASKS: Task[] = [
  {
    id: 'task-1',
    name: 'Model Todo Entity',
    description: 'id, title, completed, createdAt, updatedAt 필드를 가진 TypeORM Todo 엔티티 구현',
    type: 'BACKEND',
    orderIndex: 1,
    status: 'PENDING',
  },
  {
    id: 'task-2',
    name: 'Implement TodosService CRUD',
    description: 'Todo 생성, 목록 조회, 완료 여부 수정, 삭제 비즈니스 로직 구현',
    type: 'BACKEND',
    orderIndex: 2,
    status: 'PENDING',
  },
  {
    id: 'task-3',
    name: 'Build Todos REST API',
    description: 'GET/POST/PATCH/DELETE /todos 엔드포인트와 DTO 검증 구현',
    type: 'BACKEND',
    orderIndex: 3,
    status: 'PENDING',
  },
  {
    id: 'task-4',
    name: 'Create Todo API Client',
    description: 'React 앱에서 사용할 fetch 기반 Todo API 함수 구현',
    type: 'FRONTEND',
    orderIndex: 4,
    status: 'PENDING',
  },
  {
    id: 'task-5',
    name: 'Build Todo Form and List UI',
    description: 'Todo 추가 폼, 완료 체크박스, 삭제 버튼을 포함한 React 컴포넌트 구현',
    type: 'FRONTEND',
    orderIndex: 5,
    status: 'PENDING',
  },
  {
    id: 'task-6',
    name: 'Configure Docker Compose Runtime',
    description: 'frontend, backend, PostgreSQL을 한 번에 실행하는 compose 설정 작성',
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
            name: 'todos',
            path: 'backend/src/todos',
            children: [
              { name: 'todo.entity.ts', path: 'backend/src/todos/todo.entity.ts' },
              { name: 'create-todo.dto.ts', path: 'backend/src/todos/create-todo.dto.ts' },
              { name: 'update-todo.dto.ts', path: 'backend/src/todos/update-todo.dto.ts' },
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
          { name: 'main.tsx', path: 'frontend/src/main.tsx' },
          {
            name: 'api',
            path: 'frontend/src/api',
            children: [
              { name: 'todos.ts', path: 'frontend/src/api/todos.ts' },
            ],
          },
          {
            name: 'components',
            path: 'frontend/src/components',
            children: [
              { name: 'TodoForm.tsx', path: 'frontend/src/components/TodoForm.tsx' },
              { name: 'TodoList.tsx', path: 'frontend/src/components/TodoList.tsx' },
            ],
          },
        ],
      },
    ],
  },
  { name: 'docker-compose.yml', path: 'docker-compose.yml' },
]

const MOCK_FILE_CONTENTS: Record<string, string> = {
  'backend/src/main.ts': `import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.listen(3000)
}

bootstrap()
`,
  'backend/src/app.module.ts': `import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Todo } from './todos/todo.entity'
import { TodosController } from './todos/todos.controller'
import { TodosService } from './todos/todos.service'

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Todo],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Todo]),
  ],
  controllers: [TodosController],
  providers: [TodosService],
})
export class AppModule {}
`,
  'backend/src/todos/todo.entity.ts': `import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('todos')
export class Todo {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  title: string

  @Column({ default: false })
  completed: boolean

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
`,
  'backend/src/todos/create-todo.dto.ts': `import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string
}
`,
  'backend/src/todos/update-todo.dto.ts': `import { IsBoolean } from 'class-validator'

export class UpdateTodoDto {
  @IsBoolean()
  completed: boolean
}
`,
  'backend/src/todos/todos.service.ts': `import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Todo } from './todo.entity'
import { CreateTodoDto } from './create-todo.dto'
import { UpdateTodoDto } from './update-todo.dto'

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todosRepository: Repository<Todo>,
  ) {}

  findAll(): Promise<Todo[]> {
    return this.todosRepository.find({ order: { createdAt: 'DESC' } })
  }

  create(dto: CreateTodoDto): Promise<Todo> {
    return this.todosRepository.save(this.todosRepository.create(dto))
  }

  async update(id: string, dto: UpdateTodoDto): Promise<Todo> {
    const todo = await this.todosRepository.findOneBy({ id })
    if (!todo) throw new NotFoundException('Todo not found')
    todo.completed = dto.completed
    return this.todosRepository.save(todo)
  }

  async remove(id: string): Promise<void> {
    const result = await this.todosRepository.delete(id)
    if (result.affected === 0) throw new NotFoundException('Todo not found')
  }
}
`,
  'backend/src/todos/todos.controller.ts': `import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { CreateTodoDto } from './create-todo.dto'
import { UpdateTodoDto } from './update-todo.dto'
import { TodosService } from './todos.service'

@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  findAll() {
    return this.todosService.findAll()
  }

  @Post()
  create(@Body() dto: CreateTodoDto) {
    return this.todosService.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTodoDto) {
    return this.todosService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.todosService.remove(id)
  }
}
`,
  'frontend/src/api/todos.ts': `export interface Todo {
  id: string
  title: string
  completed: boolean
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export async function getTodos(): Promise<Todo[]> {
  const res = await fetch(\`\${API_BASE}/todos\`)
  if (!res.ok) throw new Error('Failed to load todos')
  return res.json()
}

export async function createTodo(title: string): Promise<Todo> {
  const res = await fetch(\`\${API_BASE}/todos\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to create todo')
  return res.json()
}

export async function updateTodo(id: string, completed: boolean): Promise<Todo> {
  const res = await fetch(\`\${API_BASE}/todos/\${id}\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  })
  if (!res.ok) throw new Error('Failed to update todo')
  return res.json()
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(\`\${API_BASE}/todos/\${id}\`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete todo')
}
`,
  'frontend/src/App.tsx': `import { useEffect, useState } from 'react'
import { createTodo, deleteTodo, getTodos, Todo, updateTodo } from './api/todos'
import { TodoForm } from './components/TodoForm'
import { TodoList } from './components/TodoList'

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTodos()
      .then(setTodos)
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(title: string) {
    const todo = await createTodo(title)
    setTodos((prev) => [todo, ...prev])
  }

  async function handleToggle(id: string, completed: boolean) {
    const todo = await updateTodo(id, completed)
    setTodos((prev) => prev.map((item) => (item.id === id ? todo : item)))
  }

  async function handleDelete(id: string) {
    await deleteTodo(id)
    setTodos((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">ts-todo-app</h1>
      <TodoForm onCreate={handleCreate} />
      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading...</p>
      ) : (
        <TodoList todos={todos} onToggle={handleToggle} onDelete={handleDelete} />
      )}
    </main>
  )
}
`,
  'frontend/src/components/TodoForm.tsx': `import { FormEvent, useState } from 'react'

interface TodoFormProps {
  onCreate: (title: string) => Promise<void>
}

export function TodoForm({ onCreate }: TodoFormProps) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) return
    setSaving(true)
    await onCreate(nextTitle)
    setTitle('')
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="할 일을 입력하세요"
        className="flex-1 rounded border px-3 py-2"
      />
      <button disabled={saving} className="rounded bg-black px-4 py-2 text-white">
        추가
      </button>
    </form>
  )
}
`,
  'frontend/src/components/TodoList.tsx': `import { Todo } from '../api/todos'

interface TodoListProps {
  todos: Todo[]
  onToggle: (id: string, completed: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.length === 0) {
    return <p className="mt-6 text-sm text-gray-500">아직 등록된 할 일이 없습니다.</p>
  }

  return (
    <ul className="mt-6 space-y-2">
      {todos.map((todo) => (
        <li key={todo.id} className="flex items-center gap-3 rounded border p-3">
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={(event) => onToggle(todo.id, event.target.checked)}
          />
          <span className={todo.completed ? 'flex-1 line-through text-gray-400' : 'flex-1'}>
            {todo.title}
          </span>
          <button onClick={() => onDelete(todo.id)} className="text-sm text-red-600">
            삭제
          </button>
        </li>
      ))}
    </ul>
  )
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
const SSE_STEPS: MockSseStep[] = [
  { event: { type: 'phase_started', phase: 'PHASE_2', timestamp: new Date().toISOString() }, delayMs: 12_000 },
  { event: { type: 'phase_completed', phase: 'PHASE_2', pipelineRunId: MOCK_RUN_ID, timestamp: new Date().toISOString() }, delayMs: 28_000 },
  { event: { type: 'phase_started', phase: 'PHASE_3', timestamp: new Date().toISOString() }, delayMs: 14_000 },
  { event: { type: 'task_started', taskId: 'task-1', taskName: 'Model Todo Entity', timestamp: new Date().toISOString() }, delayMs: 18_000 },
  { event: { type: 'task_completed', taskId: 'task-1', taskName: 'Model Todo Entity', timestamp: new Date().toISOString() }, delayMs: 36_000 },
  { event: { type: 'task_started', taskId: 'task-2', taskName: 'Implement TodosService CRUD', timestamp: new Date().toISOString() }, delayMs: 16_000 },
  { event: { type: 'task_completed', taskId: 'task-2', taskName: 'Implement TodosService CRUD', timestamp: new Date().toISOString() }, delayMs: 42_000 },
  { event: { type: 'task_started', taskId: 'task-3', taskName: 'Build Todos REST API', timestamp: new Date().toISOString() }, delayMs: 15_000 },
  { event: { type: 'task_completed', taskId: 'task-3', taskName: 'Build Todos REST API', timestamp: new Date().toISOString() }, delayMs: 39_000 },
  { event: { type: 'task_started', taskId: 'task-4', taskName: 'Create Todo API Client', timestamp: new Date().toISOString() }, delayMs: 17_000 },
  { event: { type: 'task_completed', taskId: 'task-4', taskName: 'Create Todo API Client', timestamp: new Date().toISOString() }, delayMs: 33_000 },
  { event: { type: 'task_started', taskId: 'task-5', taskName: 'Build Todo Form and List UI', timestamp: new Date().toISOString() }, delayMs: 16_000 },
  { event: { type: 'task_completed', taskId: 'task-5', taskName: 'Build Todo Form and List UI', timestamp: new Date().toISOString() }, delayMs: 44_000 },
  { event: { type: 'task_started', taskId: 'task-6', taskName: 'Configure Docker Compose Runtime', timestamp: new Date().toISOString() }, delayMs: 18_000 },
  { event: { type: 'task_completed', taskId: 'task-6', taskName: 'Configure Docker Compose Runtime', timestamp: new Date().toISOString() }, delayMs: 36_000 },
  { event: { type: 'phase_completed', phase: 'PHASE_3', timestamp: new Date().toISOString() }, delayMs: 22_000 },
  { event: { type: 'phase_started', phase: 'PHASE_4', timestamp: new Date().toISOString() }, delayMs: 18_000 },
  {
    event: {
      type: 'pipeline_completed',
      githubRepoUrl: 'https://github.com/dadigom/ts-todo-app',
      timestamp: new Date().toISOString(),
    },
    delayMs: 116_000,
  },
]

// ─── MSW 핸들러 ──────────────────────────────────────────────────────────────

export const handlers = [
  // ── Session ──
  http.post('/v1/session', () => {
    return HttpResponse.json({ sessionId: 'sess-s1-todo' })
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
        content: MOCK_FILE_CONTENTS[filePath] ?? `// ${filePath}\n// (generated file content)\n`,
      }
      return HttpResponse.json(content)
    }

    return HttpResponse.json(MOCK_FILE_TREE)
  }),

  // ── Pipeline ──
  http.post('/v1/pipeline/:projectId/start', () => {
    return HttpResponse.json({ pipelineId: 'pipe-s1-todo', phase: 'PHASE_1', status: 'RUNNING' })
  }),

  http.post('/v1/pipeline/:projectId/confirm', () => {
    return HttpResponse.json({ pipelineId: 'pipe-s1-todo', phase: 'PHASE_2', status: 'RUNNING' })
  }),

  http.post('/v1/pipeline/:projectId/feedback', () => {
    return HttpResponse.json({ pipelineId: 'pipe-s1-todo', phase: 'PHASE_1', status: 'RUNNING' })
  }),

  // ── SSE 스트림 — 지연 간격으로 정적 이벤트 순차 전송 ──
  http.get('/v1/pipeline/:projectId/stream', () => {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        for (const step of SSE_STEPS) {
          await new Promise<void>((resolve) => setTimeout(resolve, step.delayMs))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(step.event)}\n\n`))
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
