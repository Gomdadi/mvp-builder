import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAgentService } from './claude-agent.service';
import { S3Service } from '../s3/s3.service';
import { DockerSandboxService, SandboxResult } from '../docker/docker-sandbox.service';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { Task } from '../entities/task.entity';
import { TaskStatus, TaskType } from '../entities/enums';

export interface GeneratedFile {
  filePath: string;
  code: string;
}


@Injectable()
export class Phase3Service {
  private readonly logger = new Logger(Phase3Service.name);
  private readonly backendSystemPrompt: string;
  private readonly frontendSystemPrompt: string;
  // 보일러플레이트 프롬프트는 백엔드(_env/ 테스트 환경)와 프론트엔드(실제 프로젝트 기반 파일)로 분리
  private readonly backendBoilerplateSystemPrompt: string;
  private readonly frontendBoilerplateSystemPrompt: string;
  // per-task debug loop 프롬프트 — Phase 4의 phase4-system.md 재사용
  private readonly debugSystemPrompt: string;

  // ── Backend 툴 (TDD) ──────────────────────────────────────────────────────

  private static readonly TOOL_BACKEND_TEST: Anthropic.Tool = {
    name: 'generate_backend_test_code',
    description: Phase3Service.loadPrompt('phase3-tool-backend-test.md'),
    input_schema: {
      type: 'object',
      properties: {
        test_path: {
          type: 'string',
          description: 'Relative path of the test file from the project root (e.g., src/user/user.service.spec.ts)',
        },
        test_code: {
          type: 'string',
          description: 'Complete, runnable test file content',
        },
      },
      required: ['test_path', 'test_code'],
    },
  };

  private static readonly TOOL_BACKEND_IMPL: Anthropic.Tool = {
    name: 'generate_backend_implementation_code',
    description: Phase3Service.loadPrompt('phase3-tool-backend-impl.md'),
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Relative path of the implementation file (e.g., src/user/user.service.ts)',
        },
        code: {
          type: 'string',
          description: 'Complete implementation file content',
        },
      },
      required: ['file_path', 'code'],
    },
  };

  private static readonly BACKEND_TOOLS: Anthropic.Tool[] = [
    Phase3Service.TOOL_BACKEND_TEST,
    Phase3Service.TOOL_BACKEND_IMPL,
  ];

  // ── Frontend 툴 (TDD) ─────────────────────────────────────────────────────

  private static readonly TOOL_FRONTEND_TEST: Anthropic.Tool = {
    name: 'generate_frontend_test_code',
    description: Phase3Service.loadPrompt('phase3-tool-frontend-test.md'),
    input_schema: {
      type: 'object',
      properties: {
        test_path: {
          type: 'string',
          description: 'Relative path of the test file from the project root (e.g., src/components/LoginForm.test.tsx)',
        },
        test_code: {
          type: 'string',
          description: 'Complete, runnable component test file content',
        },
      },
      required: ['test_path', 'test_code'],
    },
  };

  private static readonly TOOL_FRONTEND_IMPL: Anthropic.Tool = {
    name: 'generate_frontend_implementation_code',
    description: Phase3Service.loadPrompt('phase3-tool-frontend-impl.md'),
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Relative path of the component file (e.g., src/components/LoginForm.tsx)',
        },
        code: {
          type: 'string',
          description: 'Complete component file content',
        },
      },
      required: ['file_path', 'code'],
    },
  };

  private static readonly FRONTEND_TOOLS: Anthropic.Tool[] = [
    Phase3Service.TOOL_FRONTEND_TEST,
    Phase3Service.TOOL_FRONTEND_IMPL,
  ];

  // ── per-task debug loop 툴 (Phase 4의 툴과 동일한 스키마) ─────────────────

  // read_files: Claude가 fileMap에서 파일 내용을 요청
  private static readonly TOOL_DEBUG_READ: Anthropic.Tool = {
    name: 'read_files',
    description: 'Read the contents of one or more files from the current workspace to understand their code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of file paths to read',
        },
      },
      required: ['file_paths'],
    },
  };

  // generate_implementation_code: 여러 파일을 한 번에 재작성
  private static readonly TOOL_DEBUG_IMPL: Anthropic.Tool = {
    name: 'generate_implementation_code',
    description: 'Generate or rewrite one or more files to fix failing tests. Pass all files that need changes in one call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        files: {
          type: 'array',
          description: 'List of files to create or rewrite',
          items: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path of the file to fix' },
              code: { type: 'string', description: 'Complete, corrected file content' },
            },
            required: ['file_path', 'code'],
          },
        },
      },
      required: ['files'],
    },
  };

  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(AnalysisDocument) private readonly analysisDocumentRepo: Repository<AnalysisDocument>,
    private readonly s3: S3Service,
    private readonly dockerSandbox: DockerSandboxService,
  ) {
    this.backendSystemPrompt = Phase3Service.loadPrompt('phase3-backend-system.md');
    this.frontendSystemPrompt = Phase3Service.loadPrompt('phase3-frontend-system.md');
    this.backendBoilerplateSystemPrompt = Phase3Service.loadPrompt('phase3-boilerplate-backend-system.md');
    this.frontendBoilerplateSystemPrompt = Phase3Service.loadPrompt('phase3-boilerplate-frontend-system.md');
    this.debugSystemPrompt = Phase3Service.loadPrompt('phase4-system.md');
  }

  async run(projectId: string, taskId: string, claudeApiKey?: string): Promise<void> {
    const task = await this.taskRepo.findOneOrFail({ where: { id: taskId } });

    const doc = await this.analysisDocumentRepo.findOne({
      where: { projectId, isConfirmed: true },
      order: { version: 'DESC' },
    });

    if (!doc) {
      throw new Error(`No confirmed analysis document found for project ${projectId}`);
    }

    await this.taskRepo.update({ id: taskId }, { status: TaskStatus.IN_PROGRESS });

    try {
      // orderIndex=0: 보일러플레이트 태스크 — type에 따라 백엔드/프론트엔드 기반 파일 생성을 분기
      if (task.orderIndex === 0 && task.type === TaskType.BACKEND) {
        await this.runBackendBoilerplate(task, doc, projectId, taskId, claudeApiKey);
      } else if (task.orderIndex === 0 && task.type === TaskType.FRONTEND) {
        await this.runFrontendBoilerplate(task, doc, projectId, taskId, claudeApiKey);
      } else if (task.type === TaskType.FRONTEND) {
        await this.runFrontend(task, doc, projectId, taskId, claudeApiKey);
      } else {
        await this.runBackend(task, doc, projectId, taskId, claudeApiKey);
      }
    } catch (e) {
      await this.taskRepo.update({ id: taskId }, { status: TaskStatus.FAILED });
      throw e;
    }
  }

  // 백엔드 보일러플레이트 태스크 실행.
  // generate_backend_implementation_code 툴을 반복 호출해 _env/ prefix 테스트 환경 파일들을 생성하고 S3에 저장한다.
  private async runBackendBoilerplate(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[] },
    projectId: string,
    taskId: string,
    claudeApiKey?: string,
  ): Promise<void> {
    this.logger.log(`Phase 3 backend boilerplate start — taskId=${taskId}`);

    const userContent = [
      '## Task',
      `Name: ${task.name}`,
      `Description: ${task.description}`,
      '',
      '## Project Directory Structure',
      JSON.stringify(doc.directoryStructure, null, 2),
    ].join('\n');

    const generated: GeneratedFile[] = [];

    await this.claudeAgent.runAgentLoop({
      system: this.backendBoilerplateSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      // TOOL_BACKEND_IMPL만 허용 — _env/ 하위 환경 파일만 생성
      tools: [Phase3Service.TOOL_BACKEND_IMPL],
      model: 'claude-sonnet-4-6',
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_backend_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          generated.push({ filePath: input.file_path, code: input.code });
          return 'File accepted. Continue with remaining boilerplate files.';
        }
        this.logger.warn(`Unexpected tool in boilerplate: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (generated.length === 0) {
      throw new Error(`Boilerplate task generated no files for project ${projectId}`);
    }

    await this.uploadAndComplete(projectId, taskId, generated);
    this.logger.log(`Phase 3 backend boilerplate complete — taskId=${taskId} files=${generated.length}`);
  }

  // 프론트엔드 보일러플레이트 태스크 실행.
  // generate_frontend_implementation_code 툴을 반복 호출해 실제 프로젝트 기반 파일들(package.json, vite.config.ts 등)을
  // 생성하고 S3에 저장한다. 백엔드 보일러플레이트와 달리 _env/ prefix를 쓰지 않고 실제 파일 경로를 사용한다.
  private async runFrontendBoilerplate(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[] },
    projectId: string,
    taskId: string,
    claudeApiKey?: string,
  ): Promise<void> {
    this.logger.log(`Phase 3 frontend boilerplate start — taskId=${taskId}`);

    const userContent = [
      '## Task',
      `Name: ${task.name}`,
      `Description: ${task.description}`,
      '',
      '## Project Directory Structure',
      JSON.stringify(doc.directoryStructure, null, 2),
    ].join('\n');

    const generated: GeneratedFile[] = [];

    await this.claudeAgent.runAgentLoop({
      system: this.frontendBoilerplateSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      // TOOL_FRONTEND_IMPL만 허용 — 프론트엔드 기반 파일만 생성
      tools: [Phase3Service.TOOL_FRONTEND_IMPL],
      model: 'claude-sonnet-4-6',
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_frontend_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          generated.push({ filePath: input.file_path, code: input.code });
          return 'File accepted. Continue with remaining boilerplate files.';
        }
        this.logger.warn(`Unexpected tool in boilerplate: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (generated.length === 0) {
      throw new Error(`Boilerplate task generated no files for project ${projectId}`);
    }

    await this.uploadAndComplete(projectId, taskId, generated);
    this.logger.log(`Phase 3 frontend boilerplate complete — taskId=${taskId} files=${generated.length}`);
  }

  private async runBackend(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[] },
    projectId: string,
    taskId: string,
    claudeApiKey?: string,
  ): Promise<void> {
    this.logger.log(`Phase 3 backend start — taskId=${taskId} name="${task.name}"`);

    const userContent = [
      '## Task',
      `Name: ${task.name}`,
      `Description: ${task.description}`,
      '',
      '## Project Directory Structure',
      JSON.stringify(doc.directoryStructure, null, 2),
    ].join('\n');

    // test/impl 파일을 배열로 수집 — 한 태스크가 여러 파일(여러 test+impl)을 담당할 수 있으므로
    // 단일 파일이 아닌 배열로 모은다. 최소 각 1개 이상 생성되었는지로 완료를 검증한다.
    const testFiles: GeneratedFile[] = [];
    const implFiles: GeneratedFile[] = [];

    await this.claudeAgent.runAgentLoop({
      system: this.backendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.BACKEND_TOOLS,
      model: 'claude-sonnet-4-6',
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_backend_test_code') {
          const input = toolInput as { test_path: string; test_code: string };
          testFiles.push({ filePath: input.test_path, code: input.test_code });
          return 'Test file accepted. Continue generating remaining test or implementation files.';
        }
        if (toolName === 'generate_backend_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          implFiles.push({ filePath: input.file_path, code: input.code });
          return 'Implementation file accepted. Continue generating remaining files.';
        }
        this.logger.warn(`Unknown tool called: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (testFiles.length === 0 || implFiles.length === 0) {
      throw new Error(`Phase 3 backend incomplete — testFiles=${testFiles.length}, implFiles=${implFiles.length} for task ${taskId}`);
    }

    const generated = [...testFiles, ...implFiles];
    // per-task sandbox: 이전 태스크 파일들을 누적해서 현재 태스크 파일과 함께 테스트
    await this.runSandboxAndDebug(projectId, taskId, generated, claudeApiKey);
    await this.uploadAndComplete(projectId, taskId, generated);
    this.logger.log(`Phase 3 backend complete — taskId=${taskId} files=${generated.length}`);
  }

  // 프론트엔드 컴포넌트 태스크를 TDD 방식으로 실행.
  // generate_frontend_test_code(테스트) → generate_frontend_implementation_code(컴포넌트) 순서로
  // 두 파일을 생성하고, 둘 다 생성되었는지 검증한 뒤 S3에 업로드한다.
  private async runFrontend(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[]; designSystem: string | null },
    projectId: string,
    taskId: string,
    claudeApiKey?: string,
  ): Promise<void> {
    this.logger.log(`Phase 3 frontend start — taskId=${taskId} name="${task.name}"`);

    const userContent = [
      '## Task',
      `Name: ${task.name}`,
      `Description: ${task.description}`,
      '',
      doc.designSystem ? `## Design System\n${doc.designSystem}` : null,
      '',
      '## Project Directory Structure',
      JSON.stringify(doc.directoryStructure, null, 2),
    ]
      .filter((line) => line !== null)
      .join('\n');

    // test/component 파일을 배열로 수집 — 한 태스크가 여러 파일(페이지+서브 컴포넌트 등)을 담당할 수 있으므로
    // 단일 파일이 아닌 배열로 모은다. 최소 각 1개 이상 생성되었는지로 완료를 검증한다.
    const testFiles: GeneratedFile[] = [];
    const componentFiles: GeneratedFile[] = [];

    await this.claudeAgent.runAgentLoop({
      system: this.frontendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.FRONTEND_TOOLS,
      model: 'claude-sonnet-4-6',
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_frontend_test_code') {
          const input = toolInput as { test_path: string; test_code: string };
          testFiles.push({ filePath: input.test_path, code: input.test_code });
          return 'Test file accepted. Continue generating remaining test or component files.';
        }
        if (toolName === 'generate_frontend_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          componentFiles.push({ filePath: input.file_path, code: input.code });
          return 'Component file accepted. Continue generating remaining files.';
        }
        this.logger.warn(`Unknown tool called: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (testFiles.length === 0 || componentFiles.length === 0) {
      throw new Error(`Phase 3 frontend incomplete — testFiles=${testFiles.length}, componentFiles=${componentFiles.length} for task ${taskId}`);
    }

    const generated = [...testFiles, ...componentFiles];
    // per-task sandbox: 이전 태스크 파일들을 누적해서 현재 태스크 파일과 함께 테스트
    await this.runSandboxAndDebug(projectId, taskId, generated, claudeApiKey);
    await this.uploadAndComplete(projectId, taskId, generated);
    this.logger.log(`Phase 3 frontend complete — taskId=${taskId} files=${generated.length}`);
  }

  private async uploadAndComplete(
    projectId: string,
    taskId: string,
    generated: GeneratedFile[],
  ): Promise<void> {
    await Promise.all(
      generated.map((file) => this.s3.uploadGeneratedFile(projectId, file.filePath, file.code)),
    );

    await this.taskRepo.update({ id: taskId }, { status: TaskStatus.DONE });
  }

  // sandbox 실행 → forward dependency 감지 → debug loop 통합 헬퍼.
  // 실패해도 throw하지 않음 — Phase 4가 최종 검증을 담당한다.
  private async runSandboxAndDebug(
    projectId: string,
    taskId: string,
    generated: GeneratedFile[],
    claudeApiKey?: string,
  ): Promise<void> {
    const result = await this.runPerTaskSandbox(projectId, generated);

    if (result.passed) {
      this.logger.log(`Phase 3 per-task sandbox passed — taskId=${taskId}`);
      return;
    }

    this.logger.warn(`Phase 3 per-task sandbox failed — taskId=${taskId}`);
    this.logger.warn(`Sandbox output:\n${result.output}`);

    const existingPaths = await this.s3.listGeneratedFiles(projectId);
    if (this.isForwardDependencyError(result.output, existingPaths)) {
      // 아직 생성되지 않은 파일을 import하는 경우 — Phase 4 전체 통합 후 재검증
      this.logger.warn(`Phase 3 sandbox skipped (forward dependency) — taskId=${taskId}`);
      return;
    }

    // 수정 가능한 에러 — debug loop 시도 (소진해도 throw하지 않음)
    await this.runTaskDebugLoop(generated, result.output, claudeApiKey);
  }

  // S3에서 이전 태스크 파일들을 다운로드해서 현재 태스크 파일과 합쳐 sandbox 실행.
  // _env/ 파일(docker-compose.yml 등)은 envFiles로 분리 — DockerSandboxService 규칙
  private async runPerTaskSandbox(projectId: string, currentFiles: GeneratedFile[]): Promise<SandboxResult> {
    const allPaths = await this.s3.listGeneratedFiles(projectId);
    const prevFiles = await Promise.all(
      allPaths.map(async (fp) => ({
        filePath: fp,
        code: await this.s3.downloadGeneratedFile(projectId, fp),
      })),
    );

    const envFiles = prevFiles.filter((f) => f.filePath.startsWith('_env/'));
    const codeFiles = [
      ...prevFiles.filter((f) => !f.filePath.startsWith('_env/')),
      ...currentFiles.filter((f) => !f.filePath.startsWith('_env/')),
    ];

    return this.dockerSandbox.runTest(envFiles, codeFiles);
  }

  // sandbox 에러 출력이 forward dependency(아직 없는 파일 import) 때문인지 판별.
  // 상대 경로 import 오류이고, 해당 경로가 현재까지 생성된 파일 목록에 없으면 true
  private isForwardDependencyError(output: string, existingPaths: string[]): boolean {
    const match = output.match(/Cannot find module '(\.\.?\/[^']+)'/);
    if (!match) return false;
    const missing = match[1].replace(/^\.\.?\//g, '').replace(/\.ts$/, '');
    return !existingPaths.some((p) => p.replace(/\.ts$/, '').includes(missing));
  }

  // per-task debug loop — Phase 4의 runDebugLoop와 동일한 구조, 더 작은 컨텍스트.
  // fileMap은 현재 태스크 파일들만 포함 (이전 파일은 수정 대상 아님).
  // debug 완료 후 generated 배열을 fileMap 변경분으로 동기화한다.
  private async runTaskDebugLoop(
    generated: GeneratedFile[],
    errorOutput: string,
    claudeApiKey?: string,
  ): Promise<void> {
    const fileMap = new Map(generated.map((f) => [f.filePath, f.code]));

    const userContent = [
      '## Test Failure Output',
      errorOutput,
      '',
      '## Current Workspace Files',
      Array.from(fileMap.keys()).join('\n'),
      '',
      'Use read_files to inspect relevant files (max 3 calls), then fix them with generate_implementation_code.',
    ].join('\n');

    await this.claudeAgent.runAgentLoop({
      system: this.debugSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [Phase3Service.TOOL_DEBUG_READ, Phase3Service.TOOL_DEBUG_IMPL],
      maxIterations: 5,
      model: 'claude-sonnet-4-6',
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'read_files') {
          const { file_paths } = toolInput as { file_paths: string[] };
          return file_paths
            .map((fp) => {
              const code = fileMap.get(fp);
              return code ? `// ${fp}\n${code}` : `// File not found: ${fp}`;
            })
            .join('\n\n---\n\n');
        }

        if (toolName === 'generate_implementation_code') {
          const { files } = toolInput as { files: { file_path: string; code: string }[] };
          for (const { file_path, code } of files) {
            fileMap.set(file_path, code);
          }
          return `${files.length} file(s) updated: ${files.map((f) => f.file_path).join(', ')}`;
        }

        this.logger.warn(`Unexpected tool in Phase 3 debug loop: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    // fileMap 변경분을 generated 배열에 반영 (참조 in-place 업데이트)
    for (const file of generated) {
      const updated = fileMap.get(file.filePath);
      if (updated !== undefined) file.code = updated;
    }
  }
}
