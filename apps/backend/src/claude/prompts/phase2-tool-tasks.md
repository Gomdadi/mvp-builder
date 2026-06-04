Generate a complete, ordered list of atomic implementation tasks from the confirmed analysis document.

Each task represents a single implementable unit — one file, one feature, or one module.
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

Example:
```json
{
  "name": "Set up project boilerplate",
  "description": "Generate project environment files: package.json (with all required dependencies), tsconfig.json, jest.config.js, and framework entry point files (e.g., main.ts, app.module.ts for NestJS). Required packages: @nestjs/common, @nestjs/core, @nestjs/platform-express, typeorm, pg, jest, ts-jest, @types/jest, reflect-metadata, rxjs",
  "type": "BACKEND",
  "order_index": 0
}
```

If the project has frontend files, also add a frontend boilerplate task with order_index=0 and type=FRONTEND:
```json
{
  "name": "Set up frontend boilerplate",
  "description": "Generate frontend project foundation files: package.json (react, react-dom, typescript, vite, @vitejs/plugin-react), vite.config.ts (path aliases from directory structure), tsconfig.json (jsx: react-jsx, strict), index.html, src/main.tsx, src/App.tsx. No test config or docker-compose needed.",
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
      "name": "Set up project boilerplate",
      "description": "Generate project environment files: docker-compose.yml (node:20-alpine, npm ci && jest), package.json (@nestjs/common, @nestjs/core, typeorm, pg, jest, ts-jest), tsconfig.json, jest.config.js, src/app.module.ts, src/main.ts. Required packages: @nestjs/common ^10, @nestjs/core ^10, @nestjs/platform-express ^10, @nestjs/typeorm ^10, typeorm ^0.3, pg ^8, reflect-metadata ^0.2, rxjs ^7",
      "type": "BACKEND",
      "order_index": 0
    },
    {
      "name": "Set up frontend boilerplate",
      "description": "Generate frontend project foundation files: package.json (react, react-dom, typescript, vite, @vitejs/plugin-react), vite.config.ts (path aliases from directory structure), tsconfig.json (jsx: react-jsx, strict), index.html, src/main.tsx, src/App.tsx. No test config or docker-compose needed.",
      "type": "FRONTEND",
      "order_index": 0
    },
    {
      "name": "Define User TypeORM entity",
      "description": "File: src/user/user.entity.ts. Define User entity with columns: id (uuid PK), email (unique), passwordHash, name, createdAt, updatedAt. Add @Index on email. No methods — data class only. No API call.",
      "type": "BACKEND",
      "order_index": 1
    },
    {
      "name": "Implement UserService CRUD",
      "description": "File: src/user/user.service.ts. Implement findById(id), create(dto), update(id, dto), delete(id). findById throws NotFoundException if not found. create throws ConflictException if email duplicated. Depends on User entity and Repository injection. No direct HTTP exposure — called by UserController.",
      "type": "BACKEND",
      "order_index": 2
    },
    {
      "name": "Implement UserController REST endpoints",
      "description": "File: src/user/user.controller.ts. Implement the following endpoints per API Spec:\n- GET /users/:id → 200 { id, email, name, createdAt } | 404 if not found\n- POST /users → 201 { id, email, name } | 409 if email duplicated. Request: { email: string, password: string, name: string }\n- PATCH /users/:id → 200 { id, email, name } | 404. Request: { name?: string, password?: string }\n- DELETE /users/:id → 204 | 404\nUse JwtAuthGuard on all routes. Delegate business logic to UserService.",
      "type": "BACKEND",
      "order_index": 3
    },
    {
      "name": "Define CreateUserDto validation",
      "description": "File: src/user/dto/create-user.dto.ts. Define DTO matching POST /users request body per API Spec: email (IsEmail), password (MinLength 8), name (IsString, IsNotEmpty). Use class-validator decorators.",
      "type": "BACKEND",
      "order_index": 3
    },
    {
      "name": "Wire UserModule",
      "description": "File: src/user/user.module.ts. Import TypeOrmModule.forFeature([User]), provide UserService, declare UserController. Export UserService for use in other modules. No API call.",
      "type": "BACKEND",
      "order_index": 4
    },
    {
      "name": "Implement LoginPage",
      "description": "File: src/pages/LoginPage.tsx. Render a login form with email and password fields.\nAPI call: POST /auth/login with { email: string, password: string }.\nOn 200: receive { accessToken: string } — store in localStorage as 'accessToken', then redirect to /dashboard.\nOn 401: display inline error message '이메일 또는 비밀번호가 올바르지 않습니다'.\nNo other API calls.",
      "type": "FRONTEND",
      "order_index": 5
    },
    {
      "name": "Implement UserProfilePage",
      "description": "File: src/pages/UserProfilePage.tsx. Display the authenticated user's profile.\nAPI call: GET /users/:id with Authorization: Bearer <accessToken from localStorage>.\nOn 200: render { id, email, name, createdAt } fields.\nOn 401: redirect to /login.\nNo API call.",
      "type": "FRONTEND",
      "order_index": 6
    }
  ]
}
```
