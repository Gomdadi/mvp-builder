Generate a complete test file for the given task. This tool must be called before generate_backend_implementation_code.

Write tests that drive the implementation — tests must fail before the implementation exists and pass after.

## Parameters

- test_path: Relative path of the test file from the project root (e.g., `src/user/user.service.spec.ts`). Follow the naming convention visible in the directory structure.
- test_code: Complete, runnable test file. Mock all external dependencies (DB, HTTP, third-party SDKs).

## What to cover

- Happy path: the main success scenario described in the task
- Error cases: missing data, invalid input, external service failures
- One test case verifies one behavior — no unrelated assertions in a single test
- No speculative test cases — only cover scenarios explicitly described in the task
