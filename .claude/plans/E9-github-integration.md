# E9: GitHub 연동 서비스 구현 계획

## Context

기존 파이프라인은 S3에 코드를 생성하는 것에서 끝났다. E9는 파이프라인 완료(Phase 4) 후 생성된 코드를 GitHub repo에 자동 push하는 기능을 추가한다.
인증/인가 없이, 요청 시 GitHub PAT와 Claude API Key를 세션(Redis)에 임시 저장하여 파이프라인에서 사용하고 완료 후 삭제한다.

---

## 1. 세션 흐름

```
POST /v1/session
  Body: { githubToken, claudeApiKey, isPrivate }
  → Redis SET session:{uuid} {json} EX 86400
  → 응답: { sessionId }

POST /v1/pipeline/:projectId/start
  Header: X-Session-Id: {sessionId}
  → BullMQ 잡 data에 sessionId 포함
  → Worker에서 Redis 조회하여 claudeApiKey 사용

[Phase4 완료 후]
  → githubToken으로 GitHub repo 생성 + S3 파일 push
  → Project.githubRepoUrl 업데이트
  → Redis DEL session:{sessionId}
```

---

## 2. 신규 파일

### `src/session/`

**`create-session.dto.ts`**
```typescript
class CreateSessionDto {
  @IsString() @IsNotEmpty() githubToken: string;
  @IsString() @IsNotEmpty() claudeApiKey: string;
  @IsBoolean() isPrivate: boolean;
}
```

**`session.service.ts`**
- `ioredis` 직접 사용 (이미 설치됨)
- `createSession(data)` → `randomUUID()` → `SETEX session:{id} 86400 {json}` → `sessionId` 반환
- `getSession(sessionId)` → `GET session:{id}` → 없으면 `null`
- `deleteSession(sessionId)` → `DEL session:{id}`

Redis 커넥션: `{ provide: 'SESSION_REDIS', useFactory: (config) => new Redis({host, port}), inject: [ConfigService] }`

**`session.controller.ts`**
- `POST /v1/session` → `createSession()` 응답: `{ sessionId }`

### `src/github/`

**`github.service.ts`**
- `@octokit/rest` 사용 (신규 설치)
- `pushGeneratedCode(token, repoName, isPrivate, files: {path, content}[])`:
  1. `octokit.rest.users.getAuthenticated()` → owner 조회
  2. `octokit.rest.repos.createForAuthenticatedUser({ name, private: isPrivate, auto_init: false })`
  3. 각 파일마다 `createBlob()`으로 blob SHA 생성
  4. `createTree(blobs)` → tree SHA
  5. `createCommit({ message: 'Initial commit', tree, parents: [] })` → commit SHA (첫 커밋이므로 parents 없음)
  6. `createRef({ ref: 'refs/heads/main', sha: commitSha })`
  7. repo URL 반환: `https://github.com/{owner}/{repoName}`

---

## 3. 수정 파일

### `apps/backend/package.json`
- `"@octokit/rest": "^21.0.0"` 추가

### `src/app.module.ts`
- `SessionModule`, `GithubModule` import 추가

### `src/claude/claude-agent.service.ts`

`ClaudeCallOptions`와 `AgentLoopOptions`에 `apiKey?: string` 추가.
`getClient(apiKey?)` private helper 추가:
```typescript
private readonly timeout: number;
private readonly maxRetries: number;
private readonly defaultApiKey: string;

private getClient(apiKey?: string): Anthropic {
  const key = apiKey || this.defaultApiKey;
  if (!key) throw new Error('No Claude API key: provide via session or CLAUDE_API_KEY env');
  if (apiKey && apiKey !== this.defaultApiKey) {
    return new Anthropic({ apiKey, timeout: this.timeout, maxRetries: this.maxRetries });
  }
  return this.client;
}
```

`CLAUDE_API_KEY` env var를 선택값으로 변경: `config.get<string>('CLAUDE_API_KEY', '')`.
`runWithTool()`, `runAgentLoop()`, `stream()` 내부에서 `this.client` → `this.getClient(options.apiKey)`.

### `src/claude/phase1.service.ts`
`run(projectId, feedbackText?, claudeApiKey?)` — `claudeApiKey`를 `runAgentLoop()` options에 전달.

### `src/claude/phase2.service.ts`
`run(projectId, pipelineRunId, claudeApiKey?)` — `runWithTool()` options에 전달.

### `src/claude/phase3.service.ts`
`run(projectId, taskId, claudeApiKey?)` → 내부 `runBackend()`, `runFrontend()`, `runBackendBoilerplate()`, `runFrontendBoilerplate()` 모두 `claudeApiKey` 전달.

### `src/claude/phase4.service.ts`
`run(projectId, claudeApiKey?)` — `runAgentLoop()` options에 전달.

### `src/pipeline/pipeline.controller.ts`
세 엔드포인트에 `@Headers('x-session-id') sessionId: string` 파라미터 추가.
각 service 메서드 호출 시 `sessionId` 전달.

### `src/pipeline/pipeline.service.ts`
`start(projectId, sessionId)`, `confirm(projectId, analysisDocumentId, sessionId)`, `feedback(projectId, analysisDocumentId, feedbackText, sessionId)`.
BullMQ 잡 data에 `sessionId` 포함.

### `src/pipeline/pipeline.worker.ts`
constructor에 `SessionService`, `GithubService`, `S3Service`, `ProjectRepository` 주입.

- `handleStart` / `handleFeedback`: `sessionService.getSession(sessionId)` → `phase1Service.run(..., claudeApiKey)`.
- `handleConfirm`: `phase2Service.run(..., claudeApiKey)`. task 잡 enqueue 시 잡 data에 `sessionId` 포함.
- `handleSandbox`: Phase4 완료 후:
  1. `sessionService.getSession(sessionId)` → `{ githubToken, isPrivate }`
  2. `s3Service.listGeneratedFiles(projectId)` + `downloadGeneratedFile()` 병렬 다운로드
  3. `repoName` = `project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
  4. `githubService.pushGeneratedCode(githubToken, repoName, isPrivate, files)`
  5. `projectRepo.update({ id: projectId }, { githubRepoUrl })` (이미 entity에 존재)
  6. `sessionService.deleteSession(sessionId)` (성공/실패 무관 finally에서 실행)

### `src/pipeline/task.worker.ts`
`handleRun`: job.data에서 `sessionId` 추출 → `sessionService.getSession()` → `phase3Service.run(..., claudeApiKey)`.
`finalizePipelineIfComplete`: SANDBOX 잡 enqueue 시 `sessionId` 포함.

---

## 4. 데이터 흐름 요약

```
POST /v1/session               → sessionId 반환
POST /v1/pipeline/:id/start    + X-Session-Id
  → PipelineWorker.handleStart
      → sessionService.getSession() → claudeApiKey
      → phase1Service.run(projectId, _, claudeApiKey)
POST /v1/pipeline/:id/confirm  + X-Session-Id
  → PipelineWorker.handleConfirm
      → phase2Service.run(..., claudeApiKey)
      → task 잡들에 sessionId 포함
  → TaskWorker.handleRun × N
      → phase3Service.run(..., claudeApiKey)
  → PipelineWorker.handleSandbox
      → phase4Service.run(..., claudeApiKey)
      → githubService.pushGeneratedCode()
      → Project.githubRepoUrl 업데이트
      → sessionService.deleteSession()
```

---

## 5. User entity 제거 + Project 정리

auth가 없으므로 `User` entity와 `Project.userId`를 제거한다. `sessionId`는 임시 데이터라 DB에 저장하지 않는다.

### 수정 파일
- `src/entities/user.entity.ts` → **삭제**
- `src/entities/project.entity.ts`:
  - `userId`, `user` (ManyToOne), `@Index(['userId'])` 제거
  - `import { User }` 제거
- `src/app.module.ts`: entities 배열에서 `User` 제거, `import { User }` 제거
- `src/entities/enums.ts`: User 관련 enum이 있으면 제거

### 마이그레이션 신규 생성
`src/migrations/{timestamp}-RemoveUser.ts`:
1. `projects.user_id` 인덱스 drop
2. `projects.user_id` FK 제거
3. `projects.user_id` 컬럼 drop
4. `users` 테이블 drop

```bash
# 마이그레이션 생성 후 실행
npx typeorm migration:run -d src/data-source.ts
```

---

## 7. 검증 방법

```bash
# 1. 인프라 기동
docker-compose up -d

# 2. 세션 생성
curl -X POST http://localhost:3001/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"githubToken":"ghp_xxx","claudeApiKey":"sk-ant-xxx","isPrivate":false}'
# → { sessionId: "uuid" }

# 3. 파이프라인 시작
curl -X POST http://localhost:3001/v1/pipeline/{projectId}/start \
  -H 'x-session-id: {sessionId}'

# 4. 완료 후 확인
# - GitHub에 repo 생성 여부
# - DB Project.githubRepoUrl 값
# - Redis에서 session 키 삭제 여부: redis-cli GET session:{sessionId} → nil

# 5. 테스트 실행
npx jest src/session/session.service.spec.ts
npx jest src/github/github.service.spec.ts
npx jest src/pipeline/pipeline.worker.spec.ts
```

---

## 8. 테스트 파일

신규 작성:
- `src/session/session.service.spec.ts`: Redis mock으로 create/get/delete 검증
- `src/github/github.service.spec.ts`: Octokit mock으로 repo 생성 + 파일 push 흐름 검증

수정:
- `src/pipeline/pipeline.worker.spec.ts`: SessionService, GithubService mock 추가
- `src/pipeline/task.worker.spec.ts`: SessionService mock 추가
- `src/claude/phase{1,2,3,4}.service.spec.ts`: claudeApiKey 파라미터 추가
