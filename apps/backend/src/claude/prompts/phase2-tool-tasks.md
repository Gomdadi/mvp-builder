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

## Output requirements

- Cover every file listed in the directory structure.
- name: Max 100 characters. Action-oriented verb phrase.
- description: Must include the target file path, what to implement, key methods or endpoints, and acceptance criteria.
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
      "name": "Define User TypeORM entity",
      "description": "File: src/user/user.entity.ts. Define User entity with columns: id (uuid PK), email (unique), passwordHash, name, createdAt, updatedAt. Add @Index on email. No methods — data class only.",
      "type": "BACKEND",
      "order_index": 1
    },
    {
      "name": "Implement UserService CRUD",
      "description": "File: src/user/user.service.ts. Implement findById(id), create(dto), update(id, dto), delete(id). findById throws NotFoundException if not found. create throws ConflictException if email duplicated. Depends on User entity and Repository injection.",
      "type": "BACKEND",
      "order_index": 2
    },
    {
      "name": "Implement UserController REST endpoints",
      "description": "File: src/user/user.controller.ts. Implement GET /users/:id, POST /users, PATCH /users/:id, DELETE /users/:id. Use JwtAuthGuard on all routes. Delegate business logic to UserService.",
      "type": "BACKEND",
      "order_index": 3
    },
    {
      "name": "Define CreateUserDto validation",
      "description": "File: src/user/dto/create-user.dto.ts. Define DTO with: email (IsEmail), password (MinLength 8), name (IsString, IsNotEmpty). Use class-validator decorators.",
      "type": "BACKEND",
      "order_index": 3
    },
    {
      "name": "Wire UserModule",
      "description": "File: src/user/user.module.ts. Import TypeOrmModule.forFeature([User]), provide UserService, declare UserController. Export UserService for use in other modules.",
      "type": "BACKEND",
      "order_index": 4
    }
  ]
}
```
