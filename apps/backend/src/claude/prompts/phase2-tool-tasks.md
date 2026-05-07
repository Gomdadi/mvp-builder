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

## Output requirements

- Cover every file listed in the directory structure.
- name: Max 100 characters. Action-oriented verb phrase.
- description: Must include the target file path, what to implement, key methods or endpoints, and acceptance criteria.
- order_index: 1-based. Tasks with no dependencies get the lowest indexes. Tasks that depend on others get higher indexes.
- Do not include speculative or optional tasks — only what is required to implement the MVP as defined in the analysis document.
