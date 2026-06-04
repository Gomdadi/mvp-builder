Read one or more files from the current workspace to understand the code before making fixes.

## When to use

- Before modifying a file, read it to understand its current state and imports.
- When an import fails, read the imported file to see what it actually exports.
- When fixing a cross-file dependency issue, read all related files first.
- When a test expects a specific interface, read the test file to understand the contract.

## Parameters

- `file_paths`: List of relative file paths to read (e.g., `["src/user/user.service.ts",
  "src/user/user.entity.ts"]`). Only paths visible in the workspace file list are valid.

## Return value

The content of each requested file, separated by `---`. If a file is not found in the
workspace, a not-found message is returned for that path instead.
