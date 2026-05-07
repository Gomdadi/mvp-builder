import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { TaskStatus } from '@prisma/client';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

// Claude 에이전트 루프가 generate_test_code → generate_implementation_code 순서로
// 수집하는 파일 타입. 루프 완료 후 S3Service를 통해 일괄 업로드됨
export interface GeneratedFile {
  filePath: string;
  code: string;
}

@Injectable()
export class Phase3Service {
  private readonly logger = new Logger(Phase3Service.name);
  // 생성자에서 MD 파일을 읽어 저장 — 요청마다 파일 I/O를 반복하지 않기 위해 인스턴스 프로퍼티로 캐싱
  private readonly systemPrompt: string;

  // ── 툴 정의 ──────────────────────────────────────────────────────────────
  // Phase 3는 툴 2개 — TDD 순서를 강제하기 위해 시스템 프롬프트에서 호출 순서를 명시

  // 1번 툴: 테스트 코드 생성. 반드시 구현 코드보다 먼저 호출되어야 함
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

  // 2번 툴: 구현 코드 생성. 테스트 코드를 통과하는 최소 구현만 포함
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

  // runAgentLoop에 넘길 툴 목록 — 시스템 프롬프트에서 1→2 호출 순서를 지시
  private static readonly TOOLS: Anthropic.Tool[] = [
    Phase3Service.TOOL_TEST,
    Phase3Service.TOOL_IMPL,
  ];

  // prompts/ 폴더의 MD 파일을 읽어 문자열로 반환.
  // static인 이유: TOOL 정의(static 필드) 초기화 시점에 호출해야 하기 때문
  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {
    this.systemPrompt = Phase3Service.loadPrompt('phase3-system.md');
  }

  // Phase 3 단건 태스크 실행.
  // 확정된 분석 문서의 디렉토리 구조를 프롬프트에 주입하여
  // TDD 순서(테스트 → 구현)로 코드를 생성하고 S3에 업로드.
  // 완료 후 태스크 상태를 DONE으로 갱신 — T-E7-02 resume 전략에서 DONE 태스크를 skip할 때 사용
  async run(projectId: string, pipelineRunId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });

    // isConfirmed=true인 가장 최신 버전의 분석 문서에서 디렉토리 구조 조회.
    // Phase 3는 이 구조를 기반으로 파일 경로와 의존 관계를 파악함
    const doc = await this.prisma.analysisDocument.findFirst({
      where: { projectId, isConfirmed: true },
      orderBy: { version: 'desc' },
    });

    if (!doc) {
      throw new Error(`No confirmed analysis document found for project ${projectId}`);
    }

    this.logger.log(`Phase 3 start — taskId=${taskId} name="${task.name}"`);

    // 디렉토리 구조 전체를 주입 — Claude가 파일 간 의존 관계를 파악하고
    // 올바른 import 경로로 코드를 생성할 수 있도록 함
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
      system: this.systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase3Service.TOOLS,
      // generate_test_code → generate_implementation_code 순서로 호출됨.
      // tool_result로 다음 단계 지시를 전달해 Claude가 순서를 이탈하지 않도록 유도
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

    // 2개 툴이 모두 호출됐는지 검증.
    // maxIterations 초과 등으로 루프가 일찍 종료되면 파일이 누락될 수 있음
    if (generated.length < 2) {
      throw new Error(`Phase 3 incomplete — only ${generated.length}/2 files generated for task ${taskId}`);
    }

    // S3에 파일 병렬 업로드 — 키 패턴은 S3Service가 관리
    await Promise.all(
      generated.map((file) => this.s3.uploadGeneratedFile(projectId, file.filePath, file.code)),
    );

    // 태스크 완료 상태 기록 — T-E7-02 Phase 3 resume 시 DONE 태스크를 skip하는 기준
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DONE },
    });

    this.logger.log(`Phase 3 complete — taskId=${taskId} files=${generated.length}`);
  }
}
