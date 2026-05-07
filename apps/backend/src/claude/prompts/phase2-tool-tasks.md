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

## Output requirements

- Cover every file listed in the directory structure.
- name: Max 100 characters. Action-oriented verb phrase.
- description: Must include the target file path, what to implement, key methods or endpoints, and acceptance criteria.
- order_index: 1-based. Tasks with no dependencies get the lowest indexes. Tasks that depend on others get higher indexes. Frontend tasks always have higher indexes than the backend tasks they depend on.
- type: `BACKEND` or `FRONTEND`.
- Do not include speculative or optional tasks — only what is required to implement the MVP as defined in the analysis document.
