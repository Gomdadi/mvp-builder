Generate the implementation file that makes the previously generated tests pass. This tool must be called after generate_backend_test_code.

## Parameters

- file_path: Relative path of the implementation file (e.g., `src/user/user.service.ts`). Must match an entry in the directory structure.
- code: Minimal implementation that passes all tests from the previous step.

## Rules

- Import only from paths that appear in the directory structure or from installed packages.
- Do not add features or abstractions beyond what the tests require.
- Every public method or export that the test file uses must be present.
- Keep it minimal — if 50 lines can replace 200, write 50.
