Generate a complete test file for the given task. This tool must be called before generate_implementation_code.

Write tests that drive the implementation — tests must fail before the implementation exists and pass after.

## Requirements

- test_path: Relative path of the test file from the project root (e.g., src/user/user.service.spec.ts). Follow the naming convention visible in the directory structure.
- test_code: Complete, runnable test file. Mock all external dependencies (DB, HTTP, third-party SDKs) using Jest mocks.

## What to cover

- Happy path: the main success scenario described in the task
- Error cases: missing data, invalid input, external service failures
- Each test case must have a clear description of what it verifies

## Conventions

- Use Jest + NestJS Testing utilities (@nestjs/testing)
- Mock dependencies via jest.fn() and useValue providers
- Do not test framework internals — only test the logic defined in the task description
