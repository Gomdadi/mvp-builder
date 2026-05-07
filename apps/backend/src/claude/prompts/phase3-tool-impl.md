Generate the implementation file that makes the previously generated tests pass. This tool must be called after generate_test_code.

## Requirements

- file_path: Relative path of the implementation file (e.g., src/user/user.service.ts). Must match an entry in the directory structure.
- code: Minimal implementation that passes all tests from the previous step.

## Rules

- Import only from paths that appear in the directory structure or from installed npm packages.
- Do not add features or abstractions beyond what the tests require.
- Every public method or export that the test file uses must be present.
- Follow the code style and patterns visible in the directory structure (e.g., NestJS @Injectable(), constructor injection).
