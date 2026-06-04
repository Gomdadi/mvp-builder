# Phase3/4 재설계: 코드 생성 분리 + Phase4 종합 sandbox 검증

## Context

현재 Phase3의 per-task sandbox는 두 가지 문제가 있다:
1. **cross-task dependency 누락**: task N sandbox에 task 0~N-1 파일이 없어 "Cannot find module" 발생
2. **무의미한 격리 테스트**: 의존 파일이 없는 상태의 sandbox 결과는 신뢰하기 어려움

**설계 방향**:
- **Phase 3**: 코드 생성 + S3 업로드만 (sandbox 제거)
- **Phase 4 (신설)**: 전체 생성 파일을 모아 종합 sandbox 실행 + Claude Code 스타일 debug loop
- 보일러플레이트(`_env/`)도 일반 생성 파일과 동일하게 FileMap에 포함
- 재시도 횟수 대폭 증가 (10회)

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `src/entities/enums.ts` | `PipelinePhase.PHASE_4` 추가 |
| `src/pipeline/pipeline.constants.ts` | `PipelineJobName.SANDBOX` 추가 |
| `src/s3/s3.service.ts` | `listGeneratedFiles()` 추가 |
| `src/claude/phase4.service.ts` | 신규 — 종합 sandbox + debug loop |
| `src/claude/claude.module.ts` | Phase4Service providers/exports 추가 |
| `src/claude/phase3.service.ts` | per-task sandbox 코드 제거 |
| `src/pipeline/task.worker.ts` | 전체 DONE 시 SANDBOX 잡 enqueue |
| `src/pipeline/pipeline.worker.ts` | `handleSandbox()` 추가, Phase4Service 주입 |
| `src/claude/prompts/phase4-system.md` | 신규 — debug loop system prompt |
| `src/claude/prompts/phase4-tool-read-files.md` | 신규 — read_files 툴 description |
| `src/claude/phase4.service.spec.ts` | 신규 |
| `src/claude/phase3.service.spec.ts` | sandbox 관련 테스트 제거/수정 |

**DB 마이그레이션 필요**: `pipeline_runs.phase` 컬럼의 PostgreSQL enum에 `PHASE_4` 값 추가.

---

## 1. `enums.ts`

```typescript
export enum PipelinePhase {
  PHASE_1 = 'PHASE_1',
  PHASE_2 = 'PHASE_2',
  PHASE_3 = 'PHASE_3',
  PHASE_4 = 'PHASE_4',  // 종합 sandbox 검증
}
```

`PipelinePhase`는 TypeORM이 DB 컬럼에 문자열로 저장하므로, 마이그레이션으로
PostgreSQL enum 타입에 `PHASE_4` 값 추가 필요:
```sql
ALTER TYPE pipeline_phase_enum ADD VALUE 'PHASE_4';
```

---

## 2. `pipeline.constants.ts`

```typescript
export enum PipelineJobName {
  START = 'pipeline.start',
  FEEDBACK = 'pipeline.feedback',
  CONFIRM = 'pipeline.confirm',
  SANDBOX = 'pipeline.sandbox',  // Phase 4 진입점
}
```

---

## 3. `s3.service.ts`: `listGeneratedFiles()` 추가

```typescript
async listGeneratedFiles(projectId: string): Promise<string[]> {
  const prefix = `generated/${projectId}/`;
  const response = await this.s3Client.send(
    new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
  );
  // MVP 규모에서 1000개 초과 없으므로 페이지네이션 생략
  return (response.Contents ?? []).map(obj => obj.Key!.replace(prefix, ''));
  // _env/ 파일도 포함 — DockerSandboxService.writeFiles()가 prefix 처리 담당
}
```

`ListObjectsV2Command`는 `@aws-sdk/client-s3`(기존 설치)에서 import.

---

## 4. `phase4.service.ts` (신규)

```typescript
// 경로: src/claude/phase4.service.ts
const SANDBOX_MAX_RETRIES = 10;

type FileMap = Map<string, string>; // filePath → code

@Injectable()
export class Phase4Service {
  private readonly debugSystemPrompt: string;

  private static readonly TOOL_READ_FILES: Anthropic.Tool = { ... };
  private static readonly TOOL_IMPL: Anthropic.Tool = { ... }; // phase3의 것과 동일 구조

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    @InjectRepository(AnalysisDocument) private readonly analysisDocumentRepo: Repository<AnalysisDocument>,
    private readonly s3: S3Service,
    private readonly dockerSandbox: DockerSandboxService,
  ) {
    this.debugSystemPrompt = Phase4Service.loadPrompt('phase4-system.md');
  }

  async run(projectId: string): Promise<void> {
    const doc = await this.analysisDocumentRepo.findOneOrFail({
      where: { projectId, isConfirmed: true },
      order: { version: 'DESC' },
    });

    // 1. 전체 생성 파일 다운로드 → FileMap
    const allPaths = await this.s3.listGeneratedFiles(projectId);
    const fileMap: FileMap = new Map();
    await Promise.all(
      allPaths.map(async fp => {
        try {
          const code = await this.s3.downloadGeneratedFile(projectId, fp);
          fileMap.set(fp, code);
        } catch {
          this.logger.warn(`File not found in S3: ${fp}`);
        }
      }),
    );

    // 2. 종합 sandbox + debug loop
    for (let attempt = 0; attempt < SANDBOX_MAX_RETRIES; attempt++) {
      // envFiles는 빈 배열 — _env/ 파일이 FileMap에 포함되며 writeFiles()가 자동 처리
      const result = await this.dockerSandbox.runTest([], fileMapToArray(fileMap));

      if (result.passed) {
        // debug loop에서 수정된 파일을 S3에 반영
        await Promise.all(
          Array.from(fileMap.entries()).map(([fp, code]) =>
            this.s3.uploadGeneratedFile(projectId, fp, code),
          ),
        );
        return;
      }

      this.logger.warn(`Phase 4 sandbox failed (attempt ${attempt + 1}/${SANDBOX_MAX_RETRIES})`);
      if (attempt === SANDBOX_MAX_RETRIES - 1) break;

      await this.runDebugLoop(fileMap, result.output, doc.directoryStructure);
    }

    throw new Error(`Phase 4 sandbox failed after ${SANDBOX_MAX_RETRIES} retries for project ${projectId}`);
  }

  private async runDebugLoop(
    fileMap: FileMap,
    errorOutput: string,
    directoryStructure: Record<string, unknown>[],
  ): Promise<void> {
    // user content: error output + 파일 목록 + directory structure
    // runAgentLoop: TOOL_READ_FILES + TOOL_IMPL, maxIterations: 8
    // read_files 콜백: FileMap에서 파일 내용 반환
    // generate_implementation_code 콜백:
    //   - *.spec.ts → 거부
    //   - 나머지 → fileMap.set(file_path, code)
  }
}
```

---

## 5. `claude.module.ts`

Phase4Service, DockerSandboxService를 providers에 추가.
DockerModule을 imports에 추가 (DockerSandboxService 제공).

---

## 6. `phase3.service.ts` 제거 항목

- `const MAX_RETRIES`
- `const ENV_FILE_PATHS`
- `private async downloadEnvFiles()`
- `private async regenerateImpl()`
- `runBackend()` 내 sandbox loop 전체

`runBackend()`는 `runAgentLoop` → `uploadAndComplete` 로만 단순화.

---

## 7. `task.worker.ts`

`finalizePipelineIfComplete()` 변경:

```typescript
// FAILED Task 있으면 PipelineRun FAILED (기존 동일)
// 전체 DONE이면 → PipelineRun COMPLETED 대신 SANDBOX 잡 enqueue
if (doneCount === totalCount) {
  await this.pipelineQueue.add(PipelineJobName.SANDBOX, { projectId, pipelineRunId });
}
```

`@InjectQueue(PIPELINE_QUEUE) private readonly pipelineQueue: Queue` 주입 추가.
`projectId`는 PipelineRun 또는 Task 엔티티에서 조회.

---

## 8. `pipeline.worker.ts`

```typescript
case PipelineJobName.SANDBOX:
  await this.handleSandbox(job);

private async handleSandbox(job: Job): Promise<void> {
  const { projectId, pipelineRunId } = job.data;
  try {
    await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_4 });
    await this.phase4Service.run(projectId);
    await this.pipelineRunRepo.update(
      { id: pipelineRunId },
      { status: PipelineStatus.COMPLETED, completedAt: new Date() },
    );
  } catch (e) {
    await this.pipelineRunRepo.update(
      { id: pipelineRunId },
      { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
    );
    throw e;
  }
}
```

`Phase4Service` 주입 추가 (`ClaudeModule`이 export하므로 자동으로 해결됨).

---

## 9. 프롬프트 파일

### `phase4-system.md`
- 역할: 전체 프로젝트 코드의 Jest 테스트 suite를 디버깅하는 시니어 엔지니어
- 워크플로우: `read_files` → 원인 분석 → `generate_implementation_code` → 반복 → `end_turn`
- 규칙: `*.spec.ts` 수정 금지 / 에러가 지시하는 것만 수정 / import 경로 오류 시 directory structure 참조
- 공통 패턴: "Cannot find module", "not a constructor", 타입 에러

### `phase4-tool-read-files.md`
- 언제: 수정 전 현재 코드 파악, import 실패 시 실제 export 확인
- 파라미터: `file_paths[]`
- 반환: 파일 내용 `---` 구분, 없는 파일은 not-found

---

## 10. 테스트

### `phase3.service.spec.ts` 수정
- `mockS3Service.downloadEnvFiles` mock 제거
- sandbox 관련 케이스(`1회 실패 후 impl 재생성`, `MAX_RETRIES 이후 FAILED`) 제거
- `runBackend` 정상 케이스: `uploadGeneratedFile` 2회(test+impl) 호출 확인으로 단순화

### `phase4.service.spec.ts` 신규
- `listGeneratedFiles가 반환한 파일 전체가 sandbox codeFiles에 전달된다`
- `sandbox 통과 시 FileMap을 S3에 재업로드한다`
- `sandbox 실패 시 runAgentLoop(debug loop)를 호출한다`
- `debug loop에서 *.spec.ts 수정 시도를 거부한다`
- `debug loop 후 sandbox 통과 시 S3 업로드 후 return한다`
- `SANDBOX_MAX_RETRIES 이후에도 실패하면 에러를 던진다`

---

## 구현 순서

```
1. enums.ts — PHASE_4 추가 + DB 마이그레이션 생성
2. pipeline.constants.ts — SANDBOX 추가
3. s3.service.ts — listGeneratedFiles() 추가
4. prompts/ — phase4-system.md, phase4-tool-read-files.md 생성  (1~3과 병렬)
5. phase4.service.ts 신규
6. claude.module.ts — Phase4Service, DockerModule 추가
7. phase3.service.ts — sandbox 코드 제거
8. task.worker.ts — finalizePipelineIfComplete 변경
9. pipeline.worker.ts — handleSandbox 추가
10. 테스트 수정 (phase3.service.spec.ts, phase4.service.spec.ts 신규)
11. 마이그레이션 실행
```

---

## 검증

```bash
cd apps/backend

# 마이그레이션 실행 (Docker Compose 기동 후)
npx typeorm migration:run -d src/data-source.ts

# Phase3 단위 테스트
npx jest src/claude/phase3.service.spec.ts

# Phase4 단위 테스트
npx jest src/claude/phase4.service.spec.ts

# 전체 테스트
npm test
```
