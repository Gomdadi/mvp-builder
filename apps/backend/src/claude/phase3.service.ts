import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAgentService } from './claude-agent.service';
import { S3Service } from '../s3/s3.service';
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

  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(AnalysisDocument) private readonly analysisDocumentRepo: Repository<AnalysisDocument>,
    private readonly s3: S3Service,
  ) {
    this.backendSystemPrompt = Phase3Service.loadPrompt('phase3-backend-system.md');
    this.frontendSystemPrompt = Phase3Service.loadPrompt('phase3-frontend-system.md');
    this.backendBoilerplateSystemPrompt = Phase3Service.loadPrompt('phase3-boilerplate-backend-system.md');
    this.frontendBoilerplateSystemPrompt = Phase3Service.loadPrompt('phase3-boilerplate-frontend-system.md');
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

    // 이전 task들이 생성한 구현 파일을 컨텍스트로 주입 — 실제 시그니처 기반 작성 유도
    const priorCode = await this.loadPriorImplementations(projectId, doc.directoryStructure);

    const userContent = [
      '## Task',
      `Name: ${task.name}`,
      `Description: ${task.description}`,
      '',
      priorCode ? `## Existing Implementations\n\n${priorCode}` : null,
      '',
      '## Project Directory Structure',
      JSON.stringify(doc.directoryStructure, null, 2),
    ]
      .filter((line) => line !== null)
      .join('\n');

    // test/impl 파일을 추적 — 두 파일 모두 생성되었는지 검증하기 위함
    let testFile: GeneratedFile | null = null;
    let implFile: GeneratedFile | null = null;

    await this.claudeAgent.runAgentLoop({
      system: this.backendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.BACKEND_TOOLS,
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_backend_test_code') {
          const input = toolInput as { test_path: string; test_code: string };
          testFile = { filePath: input.test_path, code: input.test_code };
          return 'Test code accepted. Now generate the implementation that makes these tests pass.';
        }
        if (toolName === 'generate_backend_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          implFile = { filePath: input.file_path, code: input.code };
          return 'Implementation code accepted.';
        }
        this.logger.warn(`Unknown tool called: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (!testFile || !implFile) {
      throw new Error(`Phase 3 backend incomplete — only ${[testFile, implFile].filter(Boolean).length}/2 files generated for task ${taskId}`);
    }

    // sandbox 없이 바로 S3 업로드 — 종합 검증은 Phase 4가 담당
    await this.uploadAndComplete(projectId, taskId, [testFile, implFile]);
    this.logger.log(`Phase 3 backend complete — taskId=${taskId}`);
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

    // 이전 task들이 생성한 구현 파일을 컨텍스트로 주입 — 실제 시그니처 기반 작성 유도
    const priorCode = await this.loadPriorImplementations(projectId, doc.directoryStructure);

    const userContent = [
      '## Task',
      `Name: ${task.name}`,
      `Description: ${task.description}`,
      '',
      priorCode ? `## Existing Implementations\n\n${priorCode}` : null,
      '',
      doc.designSystem ? `## Design System\n${doc.designSystem}` : null,
      '',
      '## Project Directory Structure',
      JSON.stringify(doc.directoryStructure, null, 2),
    ]
      .filter((line) => line !== null)
      .join('\n');

    // test/component 파일을 추적 — 두 파일 모두 생성되었는지 검증하기 위함
    let testFile: GeneratedFile | null = null;
    let componentFile: GeneratedFile | null = null;

    await this.claudeAgent.runAgentLoop({
      system: this.frontendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.FRONTEND_TOOLS,
      apiKey: claudeApiKey,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_frontend_test_code') {
          const input = toolInput as { test_path: string; test_code: string };
          testFile = { filePath: input.test_path, code: input.test_code };
          return 'Test code accepted. Now generate the component that makes these tests pass.';
        }
        if (toolName === 'generate_frontend_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          componentFile = { filePath: input.file_path, code: input.code };
          return 'Component code accepted.';
        }
        this.logger.warn(`Unknown tool called: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (!testFile || !componentFile) {
      throw new Error(`Phase 3 frontend incomplete — only ${[testFile, componentFile].filter(Boolean).length}/2 files generated for task ${taskId}`);
    }

    // sandbox 없이 바로 S3 업로드 — 종합 검증은 Phase 4가 담당
    await this.uploadAndComplete(projectId, taskId, [testFile, componentFile]);
    this.logger.log(`Phase 3 frontend complete — taskId=${taskId}`);
  }

  // S3에 이미 업로드된 이전 task들의 구현 파일을 읽어 컨텍스트 문자열로 반환.
  // PipelineWorker가 orderIndex ASC로 task를 순차 처리하므로, 현재 시점에 S3에 있는 파일은
  // 이전 task들이 생성한 파일이다. directoryStructure에 있는 파일만 포함해 테스트/환경 파일을
  // 스택 무관하게 자동 제외한다 — directoryStructure는 구현 파일만 나열하도록 Phase 1에서 보장.
  private async loadPriorImplementations(
    projectId: string,
    directoryStructure: Record<string, unknown>[],
  ): Promise<string> {
    const allFiles = await this.s3.listGeneratedFiles(projectId);

    // directoryStructure에 있는 경로만 허용 — 테스트 파일·_env/ 환경 파일은 여기에 없으므로 자동 제외
    const knownPaths = new Set(directoryStructure.map((e) => e.path as string));
    const implFiles = allFiles.filter((f) => knownPaths.has(f));

    if (implFiles.length === 0) return '';

    // 병렬 다운로드 — 각 파일을 "// 경로\n코드" 형태로 표현
    const entries = await Promise.all(
      implFiles.map(async (filePath) => {
        const code = await this.s3.downloadGeneratedFile(projectId, filePath);
        return `// ${filePath}\n${code}`;
      }),
    );

    return entries.join('\n\n---\n\n');
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
}
