import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';

// 에이전트 루프가 4개 툴 호출을 통해 수집하는 Phase 1 최종 결과 타입
export interface Phase1Result {
  erd: string;
  apiSpec: string;
  architecture: string;
  // [{path, role, dependencies}] 형태 — Phase 3에서 파일별 코드 생성 시 주입됨
  directoryStructure: { path: string; role: string; dependencies: string[] }[];
}

@Injectable()
export class Phase1Service {
  private readonly logger = new Logger(Phase1Service.name);
  // 생성자에서 MD 파일을 읽어 저장 — 요청마다 파일 I/O를 반복하지 않기 위해 인스턴스 프로퍼티로 캐싱
  private readonly systemPrompt: string;

  // ── 툴 정의 ──────────────────────────────────────────────────────────────
  // static readonly: 인스턴스 생성 없이 클래스 로드 시점에 초기화됨.
  // loadPrompt()가 static인 이유도 static 필드 초기화 시점에 호출해야 하기 때문.

  // 1번 툴: ERD 설계. 모든 설계의 기반 — 반드시 가장 먼저 호출되어야 함
  private static readonly TOOL_ERD: Anthropic.Tool = {
    name: 'design_erd',
    description: Phase1Service.loadPrompt('phase1-tool-erd.md'),
    input_schema: {
      type: 'object',
      properties: {
        erd: { type: 'string', description: 'Complete ERD in Mermaid erDiagram format including all entities, attributes with types, relationships, and index/constraint comments.' },
      },
      required: ['erd'],
    },
  };

  // 2번 툴: API 스펙 설계. ERD의 엔티티를 기반으로 엔드포인트를 설계
  private static readonly TOOL_API_SPEC: Anthropic.Tool = {
    name: 'design_api_spec',
    description: Phase1Service.loadPrompt('phase1-tool-api-spec.md'),
    input_schema: {
      type: 'object',
      properties: {
        api_spec: { type: 'string', description: 'Full REST API specification in markdown including base URL, auth, all endpoints with request/response examples, and common error codes.' },
      },
      required: ['api_spec'],
    },
  };

  // 3번 툴: 아키텍처 설계. ERD + API spec을 맥락으로 활용
  private static readonly TOOL_ARCHITECTURE: Anthropic.Tool = {
    name: 'design_architecture',
    description: Phase1Service.loadPrompt('phase1-tool-architecture.md'),
    input_schema: {
      type: 'object',
      properties: {
        architecture: { type: 'string', description: 'System architecture in markdown with component list, Mermaid diagram, data flow description, and security considerations.' },
      },
      required: ['architecture'],
    },
  };

  // 4번 툴: 디렉토리 구조 설계. 앞선 3개 결과를 반영한 파일 목록 생성
  // Phase 3에서 이 구조를 기반으로 파일별 코드를 생성하므로 누락 없이 완전해야 함
  private static readonly TOOL_DIRECTORY: Anthropic.Tool = {
    name: 'design_directory_structure',
    description: Phase1Service.loadPrompt('phase1-tool-directory.md'),
    input_schema: {
      type: 'object',
      properties: {
        directory_structure: {
          type: 'array',
          description: 'Complete list of every project file with path, role, and internal dependencies.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative file path from project root' },
              role: { type: 'string', description: 'One sentence describing the purpose of this file' },
              dependencies: { type: 'array', items: { type: 'string' }, description: 'List of project-internal file paths this file imports from' },
            },
            required: ['path', 'role', 'dependencies'],
          },
        },
      },
      required: ['directory_structure'],
    },
  };

  // runAgentLoop에 넘길 툴 목록 — Claude는 이 목록에서 호출할 툴을 선택
  // system prompt에서 호출 순서(1→2→3→4)를 지시하므로 순서대로 나열
  private static readonly TOOLS: Anthropic.Tool[] = [
    Phase1Service.TOOL_ERD,
    Phase1Service.TOOL_API_SPEC,
    Phase1Service.TOOL_ARCHITECTURE,
    Phase1Service.TOOL_DIRECTORY,
  ];

  // prompts/ 폴더의 MD 파일을 읽어 문자열로 반환.
  // __dirname: 개발(ts-node)에서는 src/claude/, 빌드 후에는 dist/claude/ 를 가리킴.
  // nest-cli.json assets 설정으로 MD 파일이 dist/에도 복사되므로 양쪽 환경에서 동작함.
  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    private readonly prisma: PrismaService,
  ) {
    this.systemPrompt = Phase1Service.loadPrompt('phase1-system.md');
  }

  // Phase 1 실행.
  // 에이전트 루프로 4개 툴을 순서대로 호출해 ERD → API spec → Architecture → Directory 생성 후 DB 저장.
  // userFeedback: 이전 Phase 1 결과에 대한 수정 요청 — 있으면 새 버전으로 재생성
  // 반환값: 생성된 AnalysisDocument의 id
  async run(projectId: string, userFeedback?: string): Promise<string> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    // 기존 분석 문서 수로 버전 결정 — 피드백으로 재생성할 때마다 version이 증가
    const existingCount = await this.prisma.analysisDocument.count({
      where: { projectId },
    });
    const version = existingCount + 1;

    this.logger.log(`Phase 1 start — projectId=${projectId} version=${version}`);

    // Claude에게 보낼 user 메시지 조립.
    // filter(Boolean)으로 userFeedback이 없을 때 null 항목을 제거
    const userContent = [
      `Project: ${project.name}`,
      `Requirements:\n${project.requirements}`,
      `Tech Stack:\n${JSON.stringify(project.techStack, null, 2)}`,
      userFeedback ? `User Feedback (apply to this revision):\n${userFeedback}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Partial<Phase1Result>: 4개 툴이 순서대로 호출되며 채워지는 결과 컨테이너.
    // 루프 완료 후 모든 필드가 채워졌는지 검증함
    const result: Partial<Phase1Result> = {};

    await this.claudeAgent.runAgentLoop({
      system: this.systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: Phase1Service.TOOLS,
      // onToolCall: Claude가 툴을 호출할 때마다 실행되는 콜백.
      // toolInput에서 결과를 꺼내 result에 저장하고,
      // 반환한 문자열이 tool_result로 Claude에게 전달되어 다음 툴 호출의 맥락이 됨
      onToolCall: (toolName, toolInput) => {
        switch (toolName) {
          case 'design_erd': {
            const input = toolInput as { erd: string };
            result.erd = input.erd;
            return 'ERD design complete. Now design the API specification based on this ERD.';
          }
          case 'design_api_spec': {
            const input = toolInput as { api_spec: string };
            result.apiSpec = input.api_spec;
            return 'API specification complete. Now design the system architecture.';
          }
          case 'design_architecture': {
            const input = toolInput as { architecture: string };
            result.architecture = input.architecture;
            return 'Architecture design complete. Now design the full directory structure.';
          }
          case 'design_directory_structure': {
            const input = toolInput as { directory_structure: Phase1Result['directoryStructure'] };
            result.directoryStructure = input.directory_structure;
            return 'Directory structure design complete.';
          }
          default:
            this.logger.warn(`Unknown tool called: ${toolName}`);
            return 'Unknown tool.';
        }
      },
    });

    // 4개 툴이 모두 호출됐는지 검증.
    // maxIterations 초과 등으로 루프가 일찍 종료되면 일부 필드가 비어있을 수 있음
    if (!result.erd || !result.apiSpec || !result.architecture || !result.directoryStructure) {
      throw new Error(`Phase 1 incomplete — missing: ${Object.keys(result).join(', ')}`);
    }

    const query = `${project.name} ${project.requirements}`.slice(0, 400);
    const designSystem = this.generateDesignSystem(query);

    const doc = await this.prisma.analysisDocument.create({
      data: {
        projectId,
        version,
        erd: result.erd,
        apiSpec: result.apiSpec,
        architecture: result.architecture,
        directoryStructure: result.directoryStructure,
        designSystem: designSystem ?? null,
        // userFeedback이 없으면 null 저장 — undefined는 Prisma가 허용하지 않음
        userFeedback: userFeedback ?? null,
      },
    });

    this.logger.log(`Phase 1 complete — docId=${doc.id} version=${version}`);
    return doc.id;
  }

  // UI_UX_SKILL_PATH 환경변수가 없거나 search.py 실행 실패 시 null 반환 — Phase 1 흐름은 중단하지 않음
  private generateDesignSystem(query: string): string | null {
    const skillPath = process.env.UI_UX_SKILL_PATH;
    if (!skillPath) {
      this.logger.warn('UI_UX_SKILL_PATH not set — skipping design system generation');
      return null;
    }

    try {
      return execFileSync(
        'python3',
        [path.join(skillPath, 'scripts', 'search.py'), query, '--design-system', '-f', 'markdown'],
        { timeout: 30000, encoding: 'utf-8' },
      );
    } catch (e) {
      this.logger.warn(`Design system generation failed: ${(e as Error).message}`);
      return null;
    }
  }
}
