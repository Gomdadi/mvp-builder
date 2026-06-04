Generate a complete, ordered list of atomic implementation tasks from the confirmed analysis document.

Each task represents a cohesive feature unit — group related files that belong to the same
feature or layer into one task. Do NOT create one task per file.

## Task granularity guidelines

**Core principle**: Files that are tightly coupled — sharing the same data model, calling each other directly, or always changing together — must be grouped into one task.

- Related entities (e.g., Todo + Tag + TodoTag): 1 task
- DTOs for the same resource (e.g., CreateTodoDto + UpdateTodoDto + QueryTodoDto): 1 task
- Service + Controller for the same resource: 1 task (or split only if truly complex)
- Frontend page + its sub-components: 1 task

Target total task count: 8–12 tasks for a typical MVP (excluding boilerplate tasks).
Fewer, larger tasks are preferred over many small tasks.

Each task description must list ALL target file paths it will generate.

Each task must be independently unit-testable — small enough to verify in isolation with mocked dependencies.
Tasks must be ordered so that every dependency is completed before the task that needs it.

## Naming convention

Use the format: [Verb] + [Target] + [Condition/Criteria]
Examples: "Implement UserService CRUD", "Define User data model", "Configure message queue retry strategy"

## Ordering convention

Follow this dependency order — lower indexes must come first:
1. Database schema and models (e.g., Prisma schema, TypeORM entities, Mongoose schemas)
2. Shared utilities and config modules
3. Core business logic (e.g., Services, Use Cases)
4. API layer (e.g., Controllers, Resolvers, DTOs, Validators)
5. Integration and wiring (e.g., Modules, App entry point)
6. Frontend pages and components (e.g., React pages, layout components, UI widgets)

## Task type

Each task must include a `type` field:
- `BACKEND`: server-side code (services, controllers, modules, DB schema, config, utilities)
- `FRONTEND`: client-side code (pages, components, hooks, styles)

Assign type based on the target file path. If the directory structure contains a frontend directory (e.g., `src/`, `pages/`, `components/`, `app/` under a frontend root), tasks targeting those paths are `FRONTEND`.

## API Spec compliance (required for all tasks)

Every task description must reflect the API Specification exactly — endpoint paths, HTTP methods, request/response shapes must match the API Spec provided. Do not invent endpoints or field names.

- **BACKEND tasks** that implement an API endpoint must include:
  - HTTP method and path (e.g., `POST /auth/login`)
  - Request body fields and types (e.g., `{ email: string, password: string }`)
  - Response shape and status codes (e.g., `200 { accessToken: string }`, `401 on invalid credentials`)
- **FRONTEND tasks** that call a backend API must include:
  - Which API endpoint(s) the component calls (method + path, from the API Spec)
  - The request payload it sends
  - The response fields it consumes and how (e.g., store accessToken, display user.name)

If a frontend component does not call any backend API (e.g., a pure UI component), state that explicitly: "No API call — renders props only."

## Boilerplate task (always first)

The very first task must set up the project environment. Use order_index=0 and type=BACKEND.

### docker-compose.yml is MANDATORY in the backend boilerplate

`docker-compose.yml` must ALWAYS be included in the backend boilerplate description. It is the single entry point for sandbox validation (Phase 4) and must run ALL test verification steps — backend tests AND frontend tests — in one `docker compose up`.

**CRITICAL RULES — violation causes Phase 4 to fail:**
- **backend-test service**: run the test command appropriate for the tech stack (see examples below)
- **frontend-test service** (if project has frontend): run `npm test -- --run` to execute Vitest unit tests
- BOTH services must run TESTS — not just builds. `npm run build` alone is NOT acceptable for the frontend service.
- Both services must exit with code 0 for the pipeline to pass
- The service names MUST be `backend-test` and `frontend-test` exactly

### docker-compose.yml examples by tech stack

**Node.js / NestJS + React (Vite + Vitest)**
```yaml
services:
  backend-test:
    image: node:20-alpine
    working_dir: /app/backend
    volumes:
      - ./backend:/app/backend
    command: ["sh", "-c", "npm install && npm test -- --forceExit"]
  frontend-test:
    image: node:20-alpine
    working_dir: /app/frontend
    volumes:
      - ./frontend:/app/frontend
    command: ["sh", "-c", "npm install && npm test -- --run"]
```

**Java / Spring Boot + React (Vite + Vitest)**
```yaml
services:
  backend-test:
    image: gradle:8-jdk21-alpine
    working_dir: /app/backend
    volumes:
      - ./backend:/app/backend
    command: ["sh", "-c", "./gradlew test --no-daemon"]
  frontend-test:
    image: node:20-alpine
    working_dir: /app/frontend
    volumes:
      - ./frontend:/app/frontend
    command: ["sh", "-c", "npm install && npm test -- --run"]
```

**Python / FastAPI + React (Vite + Vitest)**
```yaml
services:
  backend-test:
    image: python:3.12-slim
    working_dir: /app/backend
    volumes:
      - ./backend:/app/backend
    command: ["sh", "-c", "pip install -r requirements.txt && pytest"]
  frontend-test:
    image: node:20-alpine
    working_dir: /app/frontend
    volumes:
      - ./frontend:/app/frontend
    command: ["sh", "-c", "npm install && npm test -- --run"]
```

### Backend boilerplate description template

```json
{
  "name": "Set up backend boilerplate",
  "description": "Generate backend project environment files: docker-compose.yml (MUST include two services — backend-test: runs backend test command; frontend-test: node:20-alpine, 'npm install && npm test -- --run' — both services run TESTS, not builds. Do NOT use 'npm ci' — generated projects have no package-lock.json), package.json (all required dependencies), tsconfig.json, jest.config.js (or equivalent test config), and framework entry point files. Required packages: [list all packages with versions]",
  "type": "BACKEND",
  "order_index": 0
}
```

If the project has frontend files, also add a frontend boilerplate task with order_index=0 and type=FRONTEND:
```json
{
  "name": "Set up frontend boilerplate",
  "description": "Generate frontend project foundation files: package.json (react, react-dom, typescript, vite, @vitejs/plugin-react, vitest, @vitest/coverage-v8, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, jsdom), vite.config.ts (React plugin, path aliases, test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] }), tsconfig.json (jsx: react-jsx, strict), src/setupTests.ts (@testing-library/jest-dom import), index.html, src/main.tsx, src/App.tsx.",
  "type": "FRONTEND",
  "order_index": 0
}
```

## Output requirements

- Cover every file listed in the directory structure.
- name: Max 100 characters. Action-oriented verb phrase.
- description: Must include the target file path, what to implement, API endpoint details (per the rules above), and acceptance criteria.
- order_index: 0-based. The boilerplate task is always 0. Remaining tasks start from 1. Tasks with no dependencies get the lowest indexes. Tasks that depend on others get higher indexes. Frontend tasks always have higher indexes than the backend tasks they depend on.
- type: `BACKEND` or `FRONTEND`.
- Do not include speculative or optional tasks — only what is required to implement the MVP as defined in the analysis document.

---

## Example output

```json
{
  "tasks": [
    {
      "name": "Set up backend boilerplate",
      "description": "Generate backend project environment files: docker-compose.yml (MUST include two services — backend-test: node:20-alpine, 'npm install && npm test -- --forceExit'; frontend-test: node:20-alpine, 'npm install && npm test -- --run' — both services run TESTS. Do NOT use 'npm ci'), package.json (@nestjs/common ^10, @nestjs/core ^10, @nestjs/platform-express ^10, @nestjs/typeorm ^10, typeorm ^0.3, pg ^8, reflect-metadata ^0.2, rxjs ^7, jest ^29, ts-jest ^29, @types/jest ^29), tsconfig.json (strict, emitDecoratorMetadata), jest.config.js (ts-jest preset), src/app.module.ts, src/main.ts.",
      "type": "BACKEND",
      "order_index": 0
    },
    {
      "name": "Set up frontend boilerplate",
      "description": "Generate frontend project foundation files: package.json (react ^18, react-dom ^18, typescript ^5, vite ^5, @vitejs/plugin-react ^4, vitest ^1, @vitest/coverage-v8, @testing-library/react ^14, @testing-library/user-event ^14, @testing-library/jest-dom ^6, jsdom, axios ^1, react-router-dom ^6), vite.config.ts (React plugin, path aliases, test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] }), tsconfig.json (jsx: react-jsx, strict), src/setupTests.ts (import '@testing-library/jest-dom'), index.html (mounts #root), src/main.tsx, src/App.tsx.",
      "type": "FRONTEND",
      "order_index": 0
    },
    {
      "name": "Define Todo and Tag TypeORM entities",
      "description": "Files: src/todo/todo.entity.ts, src/tag/tag.entity.ts, src/todo/todo-tag.entity.ts. Define Todo entity (id uuid PK, title, completed, createdAt, updatedAt), Tag entity (id uuid PK, name unique), and TodoTag join entity (todoId, tagId). Add @Index where appropriate. No methods — data classes only. No API call.",
      "type": "BACKEND",
      "order_index": 1
    },
    {
      "name": "Define Todo DTOs",
      "description": "Files: src/todo/dto/create-todo.dto.ts, src/todo/dto/update-todo.dto.ts, src/todo/dto/query-todo.dto.ts. CreateTodoDto matches POST /todos body (title: IsString IsNotEmpty, tagIds?: IsUUID each). UpdateTodoDto matches PATCH /todos/:id body (title?, completed?). QueryTodoDto matches GET /todos query (completed?, tagId?). Use class-validator decorators.",
      "type": "BACKEND",
      "order_index": 2
    },
    {
      "name": "Implement TodoService and TodoController",
      "description": "Files: src/todo/todo.service.ts, src/todo/todo.controller.ts. Service: findAll(query), findById(id), create(dto), update(id, dto), delete(id). findById throws NotFoundException if not found. Controller implements per API Spec:\n- GET /todos → 200 [{ id, title, completed }] (filter by QueryTodoDto)\n- GET /todos/:id → 200 { id, title, completed, tags } | 404\n- POST /todos → 201 { id, title, completed }. Request: { title: string, tagIds?: string[] }\n- PATCH /todos/:id → 200 { id, title, completed } | 404. Request: { title?: string, completed?: boolean }\n- DELETE /todos/:id → 204 | 404\nController delegates business logic to TodoService.",
      "type": "BACKEND",
      "order_index": 3
    },
    {
      "name": "Wire TodoModule",
      "description": "File: src/todo/todo.module.ts. Import TypeOrmModule.forFeature([Todo, Tag, TodoTag]), provide TodoService, declare TodoController. Export TodoService for use in other modules. No API call.",
      "type": "BACKEND",
      "order_index": 4
    },
    {
      "name": "Implement TodoListPage with sub-components",
      "description": "Files: src/pages/TodoListPage.tsx, src/components/TodoItem.tsx, src/components/TodoForm.tsx. TodoListPage fetches and renders the todo list; TodoItem renders a single todo row with a completion toggle; TodoForm submits a new todo.\nAPI calls: GET /todos → 200 [{ id, title, completed }] (render list); POST /todos with { title: string } → 201 (append new todo); PATCH /todos/:id with { completed: boolean } → 200 (update toggle).\nTodoItem and TodoForm receive callbacks via props — no API call inside them, they render props only.",
      "type": "FRONTEND",
      "order_index": 5
    }
  ]
}
```
