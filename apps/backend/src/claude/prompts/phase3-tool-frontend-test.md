Generate a complete test file for the given UI component task. This tool must be called before generate_frontend_implementation_code.

## Parameters

- test_path: Relative path of the test file from the project root (e.g., `src/components/LoginForm.test.tsx`). Follow the naming convention in the directory structure.
- test_code: Complete, runnable test file. Test the component's behavior and logic — not its visual styling.

## What to cover

- Rendering: expected elements are present (inputs, buttons, labels)
- Interaction: user events (typing, clicking) produce the expected behavior
- Callbacks: props such as `onSubmit`/`onChange` are called with expected arguments
- No assertions on colors, spacing, or visual styling
- One test case verifies one behavior
