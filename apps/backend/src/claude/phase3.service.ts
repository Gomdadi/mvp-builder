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

  private static readonly TOOL_TEST: Anthropic.Tool = {
    name: 'generate_test_code',
    description: Phase3Service.loadPrompt('phase3-tool-test.md'),
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

  private static readonly TOOL_IMPL: Anthropic.Tool = {
    name: 'generate_implementation_code',
    description: Phase3Service.loadPrompt('phase3-tool-impl.md'),
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
    Phase3Service.TOOL_TEST,
    Phase3Service.TOOL_IMPL,
  ];

  // ── Frontend 툴 ───────────────────────────────────────────────────────────

  private static readonly TOOL_UI_COMPONENT: Anthropic.Tool = {
    name: 'generate_ui_component',
    description: Phase3Service.loadPrompt('phase3-tool-ui-component.md'),
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Relative path of the component file (e.g., src/pages/LoginPage.tsx)',
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
    Phase3Service.TOOL_UI_COMPONENT,
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

  async run(projectId: string, taskId: string): Promise<void> {
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
        await this.runBackendBoilerplate(task, doc, projectId, taskId);
      } else if (task.orderIndex === 0 && task.type === TaskType.FRONTEND) {
        await this.runFrontendBoilerplate(task, doc, projectId, taskId);
      } else if (task.type === TaskType.FRONTEND) {
        await this.runFrontend(task, doc, projectId, taskId);
      } else {
        await this.runBackend(task, doc, projectId, taskId);
      }
    } catch (e) {
      await this.taskRepo.update({ id: taskId }, { status: TaskStatus.FAILED });
      throw e;
    }
  }

  // 백엔드 보일러플레이트 태스크 실행.
  // generate_implementation_code 툴을 반복 호출해 _env/ prefix 테스트 환경 파일들을 생성하고 S3에 저장한다.
  private async runBackendBoilerplate(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[] },
    projectId: string,
    taskId: string,
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
      // TOOL_IMPL만 허용 — _env/ 하위 환경 파일만 생성
      tools: [Phase3Service.TOOL_IMPL],
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_implementation_code') {
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
  // generate_implementation_code 툴을 반복 호출해 실제 프로젝트 기반 파일들(package.json, vite.config.ts 등)을
  // 생성하고 S3에 저장한다. 백엔드 보일러플레이트와 달리 _env/ prefix를 쓰지 않고 실제 파일 경로를 사용한다.
  private async runFrontendBoilerplate(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[] },
    projectId: string,
    taskId: string,
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
      // TOOL_IMPL만 허용 — 프론트엔드 기반 파일만 생성
      tools: [Phase3Service.TOOL_IMPL],
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_implementation_code') {
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

    // test/impl 파일을 추적 — 두 파일 모두 생성되었는지 검증하기 위함
    let testFile: GeneratedFile | null = null;
    let implFile: GeneratedFile | null = null;

    await this.claudeAgent.runAgentLoop({
      system: this.backendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.BACKEND_TOOLS,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_test_code') {
          const input = toolInput as { test_path: string; test_code: string };
          testFile = { filePath: input.test_path, code: input.test_code };
          return 'Test code accepted. Now generate the implementation that makes these tests pass.';
        }
        if (toolName === 'generate_implementation_code') {
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

  private async runFrontend(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: Record<string, unknown>[]; designSystem: string | null },
    projectId: string,
    taskId: string,
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

    const { toolInput } = await this.claudeAgent.runWithTool({
      system: this.frontendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.FRONTEND_TOOLS,
    });

    const input = toolInput as { file_path: string; code: string };
    const generated: GeneratedFile[] = [{ filePath: input.file_path, code: input.code }];

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
}
