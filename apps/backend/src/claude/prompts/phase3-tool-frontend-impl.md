Generate a complete UI component file that makes the previously generated tests pass. This tool must be called after generate_frontend_test_code.

## Parameters

- file_path: Relative path of the component file from the project root (e.g., `src/components/LoginForm.tsx`). Must match an entry in the directory structure.
- code: Complete, runnable component file. Include all imports, props, and logic described in the task.

## Rules

- Implement exactly the behavior the tests assert.
- Apply the design system provided in the context.
- Import only from paths in the directory structure or installed packages.
- No features or abstractions beyond what the tests require.
