Design the full project directory structure based on the tech stack and architecture. Call this last after all other tools.

Output requirements:
- Include EVERY file that will be implemented. No placeholders like "etc." or "...".
- path: relative from project root (e.g., apps/backend/src/users/users.service.ts)
- role: one sentence describing what this file does
- dependencies: list of other paths this file imports from (only project-internal paths, not node_modules)
- Group files logically: follow the framework's conventions (e.g., NestJS module structure)
- Must reflect the entities from ERD and endpoints from API spec.

---

## Example

```json
[
  {
    "path": "apps/backend/src/user/user.entity.ts",
    "role": "TypeORM entity for User table — defines columns, indexes, and relations",
    "dependencies": []
  },
  {
    "path": "apps/backend/src/user/user.service.ts",
    "role": "Business logic for user CRUD — findById, create, update, delete",
    "dependencies": [
      "apps/backend/src/user/user.entity.ts"
    ]
  },
  {
    "path": "apps/backend/src/user/user.service.spec.ts",
    "role": "Unit tests for UserService — mocks Repository, covers happy path and error cases",
    "dependencies": [
      "apps/backend/src/user/user.service.ts",
      "apps/backend/src/user/user.entity.ts"
    ]
  },
  {
    "path": "apps/backend/src/user/user.controller.ts",
    "role": "REST endpoints for /users — GET /:id, POST /, PATCH /:id, DELETE /:id",
    "dependencies": [
      "apps/backend/src/user/user.service.ts"
    ]
  },
  {
    "path": "apps/backend/src/user/dto/create-user.dto.ts",
    "role": "DTO for POST /users request body — email, password, name validation",
    "dependencies": []
  },
  {
    "path": "apps/backend/src/user/user.module.ts",
    "role": "NestJS module that wires UserService, UserController, and TypeORM UserEntity",
    "dependencies": [
      "apps/backend/src/user/user.service.ts",
      "apps/backend/src/user/user.controller.ts",
      "apps/backend/src/user/user.entity.ts"
    ]
  },
  {
    "path": "apps/backend/src/app.module.ts",
    "role": "Root NestJS module — imports all feature modules and global config",
    "dependencies": [
      "apps/backend/src/user/user.module.ts"
    ]
  }
]
```
