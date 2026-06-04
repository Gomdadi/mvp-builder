Design the full project directory structure based on the tech stack and architecture. Call this last after all other tools.

Output requirements:
- Include EVERY implementation file that will be generated. No placeholders like "etc." or "...".
- **Do NOT include test files** (e.g., *.spec.ts, *_test.py, *Test.java). Test files are generated automatically by the code generation pipeline — listing them here would cause duplicates.
- Include project configuration and dependency files (e.g., package.json, tsconfig.json, requirements.txt, pom.xml) — these are needed as context when generating implementation code.
- path: relative from project root (e.g., apps/backend/src/users/users.service.ts)
- role: one sentence describing what this file does
- dependencies: list of other paths this file imports from (only project-internal paths, not node_modules)
- Group files logically: follow the framework's conventions (e.g., NestJS module structure)
- Must reflect the entities from ERD and endpoints from API spec.

---

## Example 1 — NestJS + TypeORM (Node.js / TypeScript)

```json
[
  {
    "path": "package.json",
    "role": "Node.js project manifest — lists all runtime and dev dependencies",
    "dependencies": []
  },
  {
    "path": "tsconfig.json",
    "role": "TypeScript compiler config — enables decorators, sets module resolution and path aliases",
    "dependencies": []
  },
  {
    "path": "src/user/user.entity.ts",
    "role": "TypeORM entity for User table — defines columns, indexes, and relations",
    "dependencies": []
  },
  {
    "path": "src/user/user.service.ts",
    "role": "Business logic for user CRUD — findById, create, update, delete",
    "dependencies": [
      "src/user/user.entity.ts"
    ]
  },
  {
    "path": "src/user/user.controller.ts",
    "role": "REST endpoints for /users — GET /:id, POST /, PATCH /:id, DELETE /:id",
    "dependencies": [
      "src/user/user.service.ts"
    ]
  },
  {
    "path": "src/user/dto/create-user.dto.ts",
    "role": "DTO for POST /users request body — email, password, name validation",
    "dependencies": []
  },
  {
    "path": "src/user/user.module.ts",
    "role": "NestJS module that wires UserService, UserController, and TypeORM UserEntity",
    "dependencies": [
      "src/user/user.service.ts",
      "src/user/user.controller.ts",
      "src/user/user.entity.ts"
    ]
  },
  {
    "path": "src/app.module.ts",
    "role": "Root NestJS module — imports all feature modules and global config",
    "dependencies": [
      "src/user/user.module.ts"
    ]
  }
]
```

---

## Example 2 — FastAPI + SQLAlchemy (Python)

```json
[
  {
    "path": "requirements.txt",
    "role": "Python dependency manifest — lists fastapi, sqlalchemy, pydantic, alembic, etc.",
    "dependencies": []
  },
  {
    "path": "app/models/user.py",
    "role": "SQLAlchemy ORM model for User table — defines columns and relationships",
    "dependencies": []
  },
  {
    "path": "app/schemas/user.py",
    "role": "Pydantic schemas for User — UserCreate, UserRead, UserUpdate request/response shapes",
    "dependencies": []
  },
  {
    "path": "app/repositories/user.py",
    "role": "Database access layer for User — find_by_id, create, update, delete using SQLAlchemy session",
    "dependencies": [
      "app/models/user.py"
    ]
  },
  {
    "path": "app/services/user.py",
    "role": "Business logic for user CRUD — validates uniqueness, delegates to UserRepository",
    "dependencies": [
      "app/repositories/user.py",
      "app/schemas/user.py"
    ]
  },
  {
    "path": "app/routers/user.py",
    "role": "FastAPI router for /users — GET /{id}, POST /, PATCH /{id}, DELETE /{id}",
    "dependencies": [
      "app/services/user.py",
      "app/schemas/user.py"
    ]
  },
  {
    "path": "app/database.py",
    "role": "SQLAlchemy engine and session factory — provides get_db dependency",
    "dependencies": []
  },
  {
    "path": "app/main.py",
    "role": "FastAPI application entry point — registers routers and middleware",
    "dependencies": [
      "app/routers/user.py",
      "app/database.py"
    ]
  }
]
```

---

## Example 3 — Spring Boot + JPA (Java)

```json
[
  {
    "path": "pom.xml",
    "role": "Maven build config — declares Spring Boot, JPA, H2/PostgreSQL, Lombok dependencies",
    "dependencies": []
  },
  {
    "path": "src/main/java/com/example/user/User.java",
    "role": "JPA entity for User table — defines columns, indexes, and lifecycle callbacks",
    "dependencies": []
  },
  {
    "path": "src/main/java/com/example/user/UserRepository.java",
    "role": "Spring Data JPA repository for User — findById, existsByEmail, save, delete",
    "dependencies": [
      "src/main/java/com/example/user/User.java"
    ]
  },
  {
    "path": "src/main/java/com/example/user/UserService.java",
    "role": "Business logic for user CRUD — delegates to UserRepository, throws domain exceptions",
    "dependencies": [
      "src/main/java/com/example/user/UserRepository.java"
    ]
  },
  {
    "path": "src/main/java/com/example/user/UserController.java",
    "role": "REST controller for /users — GET /{id}, POST /, PATCH /{id}, DELETE /{id}",
    "dependencies": [
      "src/main/java/com/example/user/UserService.java"
    ]
  },
  {
    "path": "src/main/java/com/example/user/dto/CreateUserRequest.java",
    "role": "Request DTO for POST /users — email, password, name with Bean Validation annotations",
    "dependencies": []
  },
  {
    "path": "src/main/java/com/example/Application.java",
    "role": "Spring Boot application entry point — @SpringBootApplication bootstrap",
    "dependencies": []
  }
]
```

---

## Example 4 — React + Vite (Frontend)

```json
[
  {
    "path": "package.json",
    "role": "Node.js project manifest — lists react, react-dom, vite, typescript, testing-library dependencies",
    "dependencies": []
  },
  {
    "path": "tsconfig.json",
    "role": "TypeScript compiler config — jsx: react-jsx, strict mode, path aliases",
    "dependencies": []
  },
  {
    "path": "vite.config.ts",
    "role": "Vite bundler config — React plugin, path alias resolution",
    "dependencies": []
  },
  {
    "path": "index.html",
    "role": "Vite entry HTML — mounts the React app at #root",
    "dependencies": []
  },
  {
    "path": "src/main.tsx",
    "role": "React app entry point — renders App into #root with ReactDOM.createRoot",
    "dependencies": [
      "src/App.tsx"
    ]
  },
  {
    "path": "src/App.tsx",
    "role": "Root component — sets up router and global layout",
    "dependencies": [
      "src/pages/LoginPage.tsx",
      "src/pages/DashboardPage.tsx"
    ]
  },
  {
    "path": "src/api/userApi.ts",
    "role": "API client for /users — wraps fetch calls for GET, POST, PATCH, DELETE",
    "dependencies": []
  },
  {
    "path": "src/pages/LoginPage.tsx",
    "role": "Login page — calls POST /auth/login, stores accessToken, redirects to /dashboard",
    "dependencies": [
      "src/components/LoginForm.tsx",
      "src/api/userApi.ts"
    ]
  },
  {
    "path": "src/pages/DashboardPage.tsx",
    "role": "Dashboard page — calls GET /users/:id, displays user profile",
    "dependencies": [
      "src/api/userApi.ts"
    ]
  },
  {
    "path": "src/components/LoginForm.tsx",
    "role": "Controlled login form — email/password inputs, onSubmit callback",
    "dependencies": []
  }
]
```
