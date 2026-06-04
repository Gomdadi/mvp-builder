import * as fs from 'fs';
import * as path from 'path';
import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import {ClaudeAgentService} from './claude-agent.service';
import {S3Service} from '../s3/s3.service';
import {DockerSandboxService} from '../docker/docker-sandbox.service';
import {AnalysisDocument} from '../entities/analysis-document.entity';
import {GeneratedFile} from './phase3.service';

// 종합 sandbox 최대 재시도 횟수 — per-task sandbox(3회)보다 대폭 증가
const SANDBOX_MAX_RETRIES = 10;

// in-memory 파일 누적기: filePath → code.
// debug loop에서 수정된 파일이 in-place로 반영되고, 다음 sandbox 실행 시 수정본이 사용됨
type FileMap = Map<string, string>;

// Phase4Service
// Phase 3에서 생성된 전체 파일을 S3에서 불러와 종합 sandbox 테스트를 실행한다.
// 실패 시 Claude Code 스타일 debug loop로 파일을 수정하고 재실행을 반복한다.
//
// 설계 배경:
//   Phase 3 per-task sandbox는 이전 태스크 파일이 없어 cross-task dependency를 검증할 수 없었음.
//   Phase 4에서는 모든 파일을 모은 후 한 번에 검증하므로 실제 프로젝트 환경과 동일한 조건에서 테스트 가능.
@Injectable()
export class Phase4Service {
  private readonly logger = new Logger(Phase4Service.name);
  private readonly debugSystemPrompt: string;

  // read_files 툴: Claude가 FileMap에서 특정 파일 내용을 요청.
  // 파일 내용을 파악한 후 수정 여부를 결정하도록 유도함
  private static readonly TOOL_READ_FILES: Anthropic.Tool = {
    name: 'read_files',
    description: Phase4Service.loadPrompt('phase4-tool-read-files.md'),
    input_schema: {
      type: 'object' as const,
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of file paths to read from the current workspace',
        },
      },
      required: ['file_paths'],
    },
  };

  // generate_implementation_code 툴: *.spec.ts가 아닌 파일을 재작성.
  // Phase3의 TOOL_IMPL과 동일 스키마 — Claude가 익숙한 인터페이스 재사용
  private static readonly TOOL_IMPL: Anthropic.Tool = {
    name: 'generate_implementation_code',
    description:
      'Generate or rewrite an implementation file to fix failing tests. Do NOT use for *.spec.ts files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Relative path of the implementation file to fix',
        },
        code: {
          type: 'string',
          description: 'Complete, corrected file content',
        },
      },
      required: ['file_path', 'code'],
    },
  };

  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    @InjectRepository(AnalysisDocument)
    private readonly analysisDocumentRepo: Repository<AnalysisDocument>,
    private readonly s3: S3Service,
    private readonly dockerSandbox: DockerSandboxService,
  ) {
    this.debugSystemPrompt = Phase4Service.loadPrompt('phase4-system.md');
  }

  // Phase 4 메인 진입점.
  // S3에서 모든 생성 파일을 내려받아 FileMap을 구성하고, 종합 sandbox + debug loop를 실행한다.
  // 통과 시: debug loop 수정분을 S3에 반영하고 정상 return.
  // 실패 시: SANDBOX_MAX_RETRIES 소진 후 에러를 throw (PipelineWorker가 FAILED 처리).
  async run(projectId: string): Promise<void> {
    const doc = await this.analysisDocumentRepo.findOneOrFail({
      where: { projectId, isConfirmed: true },
      order: { version: 'DESC' },
    });

    // 1. S3에서 전체 생성 파일 다운로드 → FileMap 구성
    // _env/ 파일(package.json, tsconfig.json, jest.config.js, docker-compose.yml)도 포함.
    // DockerSandboxService.writeFiles()가 _env/ prefix를 자동으로 처리함
    const allPaths = await this.s3.listGeneratedFiles(projectId);
    const fileMap: FileMap = new Map();
    await Promise.all(
      allPaths.map(async (fp) => {
        try {
          const code = await this.s3.downloadGeneratedFile(projectId, fp);
          fileMap.set(fp, code);
        } catch {
          this.logger.warn(`File not found in S3, skipping: ${fp}`);
        }
      }),
    );

    this.logger.log(`Phase 4 start — projectId=${projectId} files=${fileMap.size}`);

    // 2. 종합 sandbox + debug loop (최대 SANDBOX_MAX_RETRIES회)
    for (let attempt = 0; attempt < SANDBOX_MAX_RETRIES; attempt++) {
      // envFiles는 빈 배열 — _env/ 파일들이 FileMap에 있고 DockerSandboxService가 prefix를 자동 처리
      const result = await this.dockerSandbox.runTest(
        [],
        Phase4Service.fileMapToArray(fileMap),
      );

      if (result.passed) {
        // debug loop에서 수정된 파일들을 S3에 반영 (수정 없으면 동일 내용을 재업로드)
        await Promise.all(
          Array.from(fileMap.entries()).map(([fp, code]) =>
            this.s3.uploadGeneratedFile(projectId, fp, code),
          ),
        );
        this.logger.log(
          `Phase 4 complete — projectId=${projectId} attempt=${attempt + 1}`,
        );
        return;
      }

      this.logger.warn(
        `Phase 4 sandbox failed (attempt ${attempt + 1}/${SANDBOX_MAX_RETRIES}) — projectId=${projectId}`,
      );

      if (attempt === SANDBOX_MAX_RETRIES - 1) break;

      // 마지막 시도가 아니면 debug loop 실행 — FileMap을 in-place 수정
      await this.runDebugLoop(fileMap, result.output, doc.directoryStructure);
    }

    throw new Error(
      `Phase 4 sandbox failed after ${SANDBOX_MAX_RETRIES} retries for project ${projectId}`,
    );
  }

  // Claude Code 스타일 debug loop.
  // 에러 로그 + 파일 목록 + directory structure를 Claude에 주입하고,
  // Claude가 read_files로 파일을 읽고 generate_implementation_code로 수정하도록 유도.
  // FileMap을 in-place 업데이트 — 반환 후 다음 sandbox 실행에서 수정본이 사용됨.
  private async runDebugLoop(
    fileMap: FileMap,
    errorOutput: string,
    directoryStructure: Record<string, unknown>[],
  ): Promise<void> {
    const userContent = [
      '## Test Failure Output',
      errorOutput,
      '',
      '## Current Workspace Files',
      Array.from(fileMap.keys()).join('\n'),
      '',
      '## Project Directory Structure',
      JSON.stringify(directoryStructure, null, 2),
      '',
      'Use read_files to inspect relevant files, then fix them with generate_implementation_code.',
      'Do NOT modify *.spec.ts test files.',
    ].join('\n');

    await this.claudeAgent.runAgentLoop({
      system: this.debugSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      // TOOL_READ_FILES: 파일 내용 조회. TOOL_IMPL: 파일 수정.
      // TOOL_TEST를 제공하지 않음 — test 파일 생성을 원천 차단
      tools: [Phase4Service.TOOL_READ_FILES, Phase4Service.TOOL_IMPL],
      // read_files 3~4회 + generate_implementation_code 2~3회면 충분
      maxIterations: 8,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'read_files') {
          const { file_paths } = toolInput as { file_paths: string[] };
          // FileMap에서 요청된 파일 내용 반환. 없으면 not-found 메시지
          return file_paths
              .map((fp) => {
                const code = fileMap.get(fp);
                return code ? `// ${fp}\n${code}` : `// File not found: ${fp}`;
              })
              .join('\n\n---\n\n');
        }

        if (toolName === 'generate_implementation_code') {
          const { file_path, code } = toolInput as { file_path: string; code: string };
          // *.spec.ts 테스트 파일 수정 거부 — 테스트(명세)는 불변
          if (file_path.endsWith('.spec.ts')) {
            return 'Rejected: test files (*.spec.ts) cannot be modified. Fix the implementation instead.';
          }
          // FileMap in-place 업데이트 — 다음 sandbox 실행에서 수정본 반영
          fileMap.set(file_path, code);
          return `File ${file_path} updated.`;
        }

        this.logger.warn(`Unexpected tool in Phase 4 debug loop: ${toolName}`);
        return 'Unknown tool.';
      },
    });
  }

  // FileMap → GeneratedFile 배열 변환 헬퍼.
  // DockerSandboxService.runTest()의 codeFiles 파라미터 형식으로 변환
  private static fileMapToArray(map: FileMap): GeneratedFile[] {
    return Array.from(map.entries()).map(([filePath, code]) => ({ filePath, code }));
  }
}
