import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { TaskStatus, TaskType } from '@prisma/client';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

export interface GeneratedFile {
  filePath: string;
  code: string;
}

@Injectable()
export class Phase3Service {
  private readonly logger = new Logger(Phase3Service.name);
  private readonly backendSystemPrompt: string;
  private readonly frontendSystemPrompt: string;

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
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {
    this.backendSystemPrompt = Phase3Service.loadPrompt('phase3-backend-system.md');
    this.frontendSystemPrompt = Phase3Service.loadPrompt('phase3-frontend-system.md');
  }

  async run(projectId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });

    const doc = await this.prisma.analysisDocument.findFirst({
      where: { projectId, isConfirmed: true },
      orderBy: { version: 'desc' },
    });

    if (!doc) {
      throw new Error(`No confirmed analysis document found for project ${projectId}`);
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.IN_PROGRESS },
    });

    try {
      if (task.type === TaskType.FRONTEND) {
        await this.runFrontend(task, doc, projectId, taskId);
      } else {
        await this.runBackend(task, doc, projectId, taskId);
      }
    } catch (e) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED },
      });
      throw e;
    }
  }

  private async runBackend(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: unknown },
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

    const generated: GeneratedFile[] = [];

    await this.claudeAgent.runAgentLoop({
      system: this.backendSystemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.BACKEND_TOOLS,
      onToolCall: (toolName, toolInput) => {
        if (toolName === 'generate_test_code') {
          const input = toolInput as { test_path: string; test_code: string };
          generated.push({ filePath: input.test_path, code: input.test_code });
          return 'Test code accepted. Now generate the implementation that makes these tests pass.';
        }
        if (toolName === 'generate_implementation_code') {
          const input = toolInput as { file_path: string; code: string };
          generated.push({ filePath: input.file_path, code: input.code });
          return 'Implementation code accepted.';
        }
        this.logger.warn(`Unknown tool called: ${toolName}`);
        return 'Unknown tool.';
      },
    });

    if (generated.length < 2) {
      throw new Error(`Phase 3 backend incomplete — only ${generated.length}/2 files generated for task ${taskId}`);
    }

    await this.uploadAndComplete(projectId, taskId, generated);
    this.logger.log(`Phase 3 backend complete — taskId=${taskId} files=${generated.length}`);
  }

  private async runFrontend(
    task: { id: string; name: string; description: string },
    doc: { directoryStructure: unknown; designSystem: string | null },
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

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DONE },
    });
  }
}
