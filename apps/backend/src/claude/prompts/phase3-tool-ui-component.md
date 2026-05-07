Generate a complete UI component file for the given task. Apply the design system provided in the context.

## Requirements

- file_path: Relative path of the component file from the project root (e.g., src/pages/LoginPage.tsx). Must match an entry in the directory structure.
- code: Complete, runnable component file. Include all imports, props, and logic described in the task.

## Rules

- Use colors, typography, and effects exactly as specified in the design system.
- Import only from paths that appear in the directory structure or from installed packages.
- Do not add features or abstractions beyond what the task description requires.
- Every prop or callback the task description references must be present.
