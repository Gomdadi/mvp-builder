# Phase 3 — 이전 task 구현 파일을 컨텍스트로 주입

## Context

Phase 3에서 각 task는 독립적으로 실행되며, Claude가 받는 정보는 `task.name`, `task.description`, `directoryStructure`뿐이다. 이전 task가 생성한 파일의 실제 내용(메서드 시그니처, 타입 등)은 전달되지 않아 Claude가 추측에 의존한다.

예: `UserController` task 실행 시 `UserService`가 실제로 어떤 메서드를 구현했는지 모른 채 작성 → 메서드명/시그니처 불일치로 컴파일 에러 가능.

**목표**: 현재 task 실행 시점에 S3에 이미 업로드된 구현 파일들을 읽어 userContent에 `## Existing Implementations` 섹션으로 주입. 실제 코드를 보고 작성하므로 일관성 보장.

---

## 핵심 전제

- PipelineWorker가 `orderIndex ASC` 순서로 task를 **순차** 처리한다.
- 따라서 현재 task 실행 시점에 S3에 있는 파일 = 이전 task들이 완료 후 업로드한 파일.
- 이 가정이 성립하므로 별도 의존성 추적 없이 `s3Service.listGeneratedFiles(projectId)` 결과를 그대로 사용할 수 있다.

---

## 재사용할 기존 유틸리티

- `s3.service.ts` — `listGeneratedFiles(projectId): Promise<string[]>`
- `s3.service.ts` — `downloadGeneratedFile(projectId, filePath): Promise<string>`

두 메서드가 이미 존재하므로 추가 구현 불필요.

---

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/claude/phase3.service.ts` | `loadPriorImplementations()` 추가, `runBackend()` / `runFrontend()` userContent에 주입 |
| `src/claude/phase3.service.spec.ts` | S3 mock에 `listGeneratedFiles` / `downloadGeneratedFile` 추가, 신규 케이스 추가 |
| `src/claude/prompts/phase3-backend-system.md` | Existing Implementations 섹션 활용 지시 추가 |
| `src/claude/prompts/phase3-frontend-system.md` | 동일 |

---

## 구현 상세

### 1. `loadPriorImplementations()` — phase3.service.ts에 추가

```typescript
// S3에 업로드된 구현 파일들을 읽어 컨텍스트 문자열로 반환.
// 보일러플레이트/테스트/설정 파일은 구현에 불필요하므로 제외한다.
private async loadPriorImplementations(projectId: string): Promise<string> {
  const allFiles = await this.s3Service.listGeneratedFiles(projectId);

  // 제외 패턴: 환경 파일, 테스트 파일, 프레임워크 설정 파일
  const EXCLUDE = [
    /^_env\//,                                              // 백엔드 보일러플레이트 환경 파일
    /\.(spec|test)\.(ts|tsx|js|jsx|py)$/,                  // 테스트 파일
    /\/test\//,                                            // test 디렉토리
    /^(package\.json|tsconfig.*|jest\.config.*|vite\.config.*|vitest\.config.*|index\.html|src\/test\/.*)$/,
  ];

  const implFiles = allFiles.filter(
    (f) => !EXCLUDE.some((pattern) => pattern.test(f))
  );

  if (implFiles.length === 0) return '';

  // 병렬 다운로드
  const entries = await Promise.all(
    implFiles.map(async (filePath) => {
      const code = await this.s3Service.downloadGeneratedFile(projectId, filePath);
      return `// ${filePath}\n${code}`;
    })
  );

  return entries.join('\n\n---\n\n');
}
```

### 2. `runBackend()` / `runFrontend()` — userContent 수정

두 메서드 모두 동일 패턴 적용:

```typescript
const priorCode = await this.loadPriorImplementations(projectId);

const userContent = [
  '## Task',
  `Name: ${task.name}`,
  `Description: ${task.description}`,
  '',
  priorCode ? `## Existing Implementations\n\n${priorCode}` : null,
  '',
  // [프론트엔드만] doc.designSystem ? `## Design System\n${doc.designSystem}` : null,
  '## Project Directory Structure',
  JSON.stringify(doc.directoryStructure, null, 2),
].filter((line) => line !== null).join('\n');
```

보일러플레이트 메서드(`runBackendBoilerplate`, `runFrontendBoilerplate`)는 **제외** — orderIndex=0 단계라 이전 파일이 없고 환경 파일만 생성하므로 불필요.

### 3. 시스템 프롬프트 수정

**`phase3-backend-system.md`** 에 Rules 섹션 추가:

```
- If an "## Existing Implementations" section is present in the user message:
  use the actual method signatures, class names, and import paths from those files.
  Do not guess — if a dependency's implementation is provided, match it exactly.
```

**`phase3-frontend-system.md`** 에 동일 내용 추가.

---

## spec 테스트 변경 — phase3.service.spec.ts

### S3 mock 확장

```typescript
const mockS3Service = {
  uploadGeneratedFile: jest.fn(),
  listGeneratedFiles: jest.fn().mockResolvedValue([]),     // 기본: 빈 배열
  downloadGeneratedFile: jest.fn(),
};
```

기존 모든 테스트 케이스는 `listGeneratedFiles`가 `[]`를 반환하므로 동작 변화 없음.

### 신규 케이스 추가 (runBackend, runFrontend 각 1개)

**runBackend — 이전 파일이 있을 때 Existing Implementations 섹션 포함**
```typescript
it('이전 구현 파일이 있으면 userContent에 Existing Implementations 섹션을 포함한다', async () => {
  mockS3Service.listGeneratedFiles.mockResolvedValue(['src/user/user.entity.ts']);
  mockS3Service.downloadGeneratedFile.mockResolvedValue('export class User { id: string; }');
  mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);
  mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
  mockTaskRepo.update.mockResolvedValue({});

  await service.run(projectId, fakeBackendTask.id);

  const calledOptions = mockClaudeAgent.runAgentLoop.mock.calls[0][0];
  expect(calledOptions.messages[0].content).toContain('## Existing Implementations');
  expect(calledOptions.messages[0].content).toContain('user.entity.ts');
});
```

**runFrontend — 동일 패턴**

---

## 구현 순서

```
1. phase3.service.ts — loadPriorImplementations() 추가
2. phase3.service.ts — runBackend(), runFrontend() userContent 수정
3. phase3-backend-system.md, phase3-frontend-system.md — 지시 추가
4. phase3.service.spec.ts — mock 확장 + 신규 케이스 추가
```

---

## 검증

```bash
cd apps/backend
npx jest src/claude/phase3.service.spec.ts --no-coverage
npm test
```

실행 후 확인:
- 기존 62개 테스트 모두 통과 (신규 케이스 추가로 총 64개)
- `listGeneratedFiles`가 빈 배열 반환 시 userContent에 Existing Implementations 섹션 미포함 확인
- 파일이 있을 때 섹션 포함 + 파일 경로/코드 내용 포함 확인
