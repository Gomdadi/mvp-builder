import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';

// generate_tasks 툴 호출 시 Claude가 반환하는 JSON 타입.
// Phase 3에서 이 목록을 순서대로 순회하며 파일별 코드를 생성함
export interface TaskListInput {
  tasks: { name: string; description: string; order_index: number }[];
}

@Injectable()
export class Phase2Service {
  private readonly logger = new Logger(Phase2Service.name);
  // 생성자에서 MD 파일을 읽어 저장 — 요청마다 파일 I/O를 반복하지 않기 위해 인스턴스 프로퍼티로 캐싱
  private readonly systemPrompt: string;

  // ── 툴 정의 ──────────────────────────────────────────────────────────────
  // Phase 2는 툴이 하나 — 확정된 분석 문서를 입력으로 받아 태스크 목록을 한 번에 생성
  // runWithTool()로 단건 호출하므로 에이전트 루프 불필요
  private static readonly TOOL: Anthropic.Tool = {
    name: 'generate_tasks',
    description: Phase2Service.loadPrompt('phase2-tool-tasks.md'),
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Ordered list of implementation tasks',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Short, action-oriented task name (max 100 chars)',
              },
              description: {
                type: 'string',
                // 파일 경로, 구현 내용, 핵심 메서드/엔드포인트, 완료 기준을 포함하도록 지시
                description: 'Detailed description including target file path, what to implement, key methods/endpoints, and acceptance criteria',
              },
              order_index: {
                type: 'integer',
                // 1부터 시작하는 실행 순서 — 낮은 번호부터 완료해야 다음 태스크 진행 가능
                description: 'Execution order (1-based). Tasks with no dependencies get the lowest indexes.',
              },
            },
            required: ['name', 'description', 'order_index'],
          },
        },
      },
      required: ['tasks'],
    },
  };

  // prompts/ 폴더의 MD 파일을 읽어 문자열로 반환.
  // static인 이유: TOOL 정의(static 필드) 초기화 시점에 호출해야 하기 때문
  // __dirname: 개발(ts-node)에서는 src/claude/, 빌드 후에는 dist/claude/ 를 가리킴
  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    private readonly prisma: PrismaService,
  ) {
    this.systemPrompt = Phase2Service.loadPrompt('phase2-system.md');
  }

  // Phase 2 실행.
  // isConfirmed=true인 최신 분석 문서를 기반으로 태스크 목록을 생성하고 DB에 일괄 저장.
  // pipelineRunId: 생성된 태스크와 파이프라인 실행을 연결하는 외래키
  async run(projectId: string, pipelineRunId: string): Promise<void> {
    // isConfirmed=true인 가장 최신 버전의 분석 문서 조회.
    // 사용자가 Phase 1 결과를 확정(confirm)해야 Phase 2를 실행할 수 있음
    const doc = await this.prisma.analysisDocument.findFirst({
      where: { projectId, isConfirmed: true },
      orderBy: { version: 'desc' },
    });

    if (!doc) {
      throw new Error(`No confirmed analysis document found for project ${projectId}`);
    }

    this.logger.log(`Phase 2 start — projectId=${projectId} docId=${doc.id}`);

    // Claude에게 보낼 user 메시지 조립.
    // ERD + API spec + Architecture + Directory Structure를 모두 포함해
    // Claude가 누락 없이 전체 구현 태스크를 생성할 수 있도록 함
    const userContent = [
      'Based on the following analysis document, generate an ordered list of atomic implementation tasks.',
      '',
      `## ERD\n${doc.erd}`,
      `## API Specification\n${doc.apiSpec}`,
      `## Architecture\n${doc.architecture}`,
      // directoryStructure는 JSON(JSONB) 타입 — 보기 좋게 포맷해서 전달
      `## Directory Structure\n${JSON.stringify(doc.directoryStructure, null, 2)}`,
    ].join('\n');

    // runWithTool(): 단건 Claude 호출 — tool_use 블록에서 태스크 목록을 추출해 반환.
    // Phase 1과 달리 툴이 하나라 에이전트 루프 없이 단건 호출로 충분
    const { toolInput } = await this.claudeAgent.runWithTool({
      system: this.systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [Phase2Service.TOOL],
      // toolName 지정 → tool_choice: { type: 'tool', name: 'generate_tasks' }
      // 반드시 이 툴만 호출하도록 강제
      toolName: Phase2Service.TOOL.name,
    });

    const input = toolInput as TaskListInput;

    // createMany(): 태스크 목록을 한 번의 쿼리로 일괄 저장 — 개별 create()보다 효율적
    await this.prisma.task.createMany({
      data: input.tasks.map((t) => ({
        projectId,
        pipelineRunId,
        name: t.name,
        description: t.description,
        // Claude가 반환한 order_index(snake_case)를 Prisma 필드명(camelCase)으로 변환
        orderIndex: t.order_index,
      })),
    });

    this.logger.log(`Phase 2 complete — ${input.tasks.length} tasks created`);
  }
}
