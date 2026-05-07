import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { Test, TestingModule } from '@nestjs/testing';
import { Phase1Service } from './phase1.service';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';

// fs 모듈 전체를 mock — Phase1Service 생성자와 static 필드에서 MD 파일을 읽는데,
// 테스트 환경에서는 실제 파일이 없을 수 있으므로 가짜 문자열을 반환하도록 교체
jest.mock('fs');
const mockReadFileSync = fs.readFileSync as jest.Mock;
// static 필드(TOOL_ERD 등) 초기화 시점에도 호출되므로 모듈 로드 직후 기본값 설정
mockReadFileSync.mockReturnValue('mocked system prompt');

// child_process mock — 실제 Python 실행 없이 search.py 결과를 시뮬레이션
jest.mock('child_process', () => ({ execFileSync: jest.fn() }));
const mockExecFileSync = execFileSync as jest.Mock;

// ClaudeAgentService mock — 실제 Claude API 호출 없이 onToolCall 콜백만 테스트
const mockClaudeAgent = { runAgentLoop: jest.fn() };

// PrismaService mock — 실제 DB 없이 반환값을 지정해 로직만 검증
const mockPrisma = {
  project: { findUniqueOrThrow: jest.fn() },
  analysisDocument: { count: jest.fn(), create: jest.fn() },
};

// 테스트용 프로젝트 데이터 — findUniqueOrThrow의 반환값으로 사용
const project = {
  id: 'proj-1',
  name: 'Test App',
  requirements: 'Build a task manager',
  techStack: { backend: 'NestJS', database: 'PostgreSQL' },
};

describe('Phase1Service', () => {
  let service: Phase1Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks가 mockReturnValue도 초기화하므로 매 테스트 전에 재설정
    mockReadFileSync.mockReturnValue('mocked system prompt');
    // UI_UX_SKILL_PATH 기본값 설정 — 각 테스트에서 필요시 override
    process.env.UI_UX_SKILL_PATH = '/mock/skill/path';
    mockExecFileSync.mockReturnValue('# Mock Design System\n## Colors\n- Primary: #3B82F6');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Phase1Service,
        { provide: ClaudeAgentService, useValue: mockClaudeAgent },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<Phase1Service>(Phase1Service);
  });

  describe('run', () => {
    // runAgentLoop를 시뮬레이션하는 헬퍼 함수.
    // 실제 루프 대신 4개 툴의 onToolCall 콜백을 직접 순서대로 호출해
    // Phase1Service의 result 수집 로직과 DB 저장 흐름을 검증함
    const simulateAgentLoop = async (options: any) => {
      await options.onToolCall('design_erd', { erd: 'erDiagram\n  User {}' });
      await options.onToolCall('design_api_spec', { api_spec: '## API\nGET /users' });
      await options.onToolCall('design_architecture', { architecture: '## Arch\nNestJS + DB' });
      await options.onToolCall('design_directory_structure', {
        directory_structure: [{ path: 'src/app.module.ts', role: 'Root module', dependencies: [] }],
      });
    };

    // 정상 케이스: 4개 툴이 모두 호출되면 결과를 DB에 저장하고 doc id를 반환
    it('4개 툴 결과를 수집해 DB에 저장하고 doc id를 반환한다', async () => {
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      // count가 0 → 기존 문서 없음 → version=1
      mockPrisma.analysisDocument.count.mockResolvedValue(0);
      mockPrisma.analysisDocument.create.mockResolvedValue({ id: 'doc-1' });
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      const result = await service.run('proj-1');

      // create가 올바른 데이터로 호출됐는지 검증
      expect(mockPrisma.analysisDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'proj-1',
          version: 1,
          erd: 'erDiagram\n  User {}',
          apiSpec: '## API\nGET /users',
          userFeedback: null,
        }),
      });
      expect(result).toBe('doc-1');
    });

    // design system 케이스: UI_UX_SKILL_PATH가 설정되면 search.py 결과가 저장됨
    it('UI_UX_SKILL_PATH가 설정되면 design system을 생성해 저장한다', async () => {
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      mockPrisma.analysisDocument.count.mockResolvedValue(0);
      mockPrisma.analysisDocument.create.mockResolvedValue({ id: 'doc-1' });
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'python3',
        expect.arrayContaining(['--design-system', '-f', 'markdown']),
        expect.objectContaining({ encoding: 'utf-8' }),
      );
      expect(mockPrisma.analysisDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          designSystem: '# Mock Design System\n## Colors\n- Primary: #3B82F6',
        }),
      });
    });

    // UI_UX_SKILL_PATH 미설정 케이스: 환경변수 없으면 designSystem은 null로 저장
    it('UI_UX_SKILL_PATH가 없으면 designSystem을 null로 저장한다', async () => {
      delete process.env.UI_UX_SKILL_PATH;
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      mockPrisma.analysisDocument.count.mockResolvedValue(0);
      mockPrisma.analysisDocument.create.mockResolvedValue({ id: 'doc-1' });
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1');

      expect(mockExecFileSync).not.toHaveBeenCalled();
      expect(mockPrisma.analysisDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ designSystem: null }),
      });
    });

    // search.py 실패 케이스: execFileSync 예외 발생 시 null로 fallback, Phase 1은 계속 진행
    it('search.py 실패 시 designSystem을 null로 저장하고 Phase 1은 계속 진행한다', async () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('python3 not found'); });
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      mockPrisma.analysisDocument.count.mockResolvedValue(0);
      mockPrisma.analysisDocument.create.mockResolvedValue({ id: 'doc-1' });
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      const result = await service.run('proj-1');

      expect(mockPrisma.analysisDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ designSystem: null }),
      });
      expect(result).toBe('doc-1');
    });

    // userFeedback 케이스: 피드백이 있으면 version이 증가하고 feedback 내용이 저장됨
    it('userFeedback이 있으면 버전이 증가하고 feedback이 저장된다', async () => {
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      // count가 1 → 기존 문서 1개 → version=2
      mockPrisma.analysisDocument.count.mockResolvedValue(1);
      mockPrisma.analysisDocument.create.mockResolvedValue({ id: 'doc-2' });
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1', '결제 기능 제외해주세요');

      expect(mockPrisma.analysisDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 2,
          userFeedback: '결제 기능 제외해주세요',
        }),
      });
    });

    // 불완전한 루프 케이스: maxIterations 초과 등으로 일부 툴이 호출되지 않으면 에러
    // DB 저장 없이 에러를 던져야 함 — 불완전한 데이터가 저장되면 안 됨
    it('4개 툴 중 일부가 호출되지 않으면 에러를 던진다', async () => {
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      mockPrisma.analysisDocument.count.mockResolvedValue(0);

      // design_erd만 호출하고 나머지 3개는 생략 — 루프가 일찍 종료된 상황 시뮬레이션
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options) => {
        await options.onToolCall('design_erd', { erd: 'erDiagram' });
      });

      await expect(service.run('proj-1')).rejects.toThrow('Phase 1 incomplete');
      // 불완전한 결과는 DB에 저장하지 않아야 함
      expect(mockPrisma.analysisDocument.create).not.toHaveBeenCalled();
    });

    // API 실패 케이스: runAgentLoop 자체가 실패하면 에러를 위로 전파하고 DB 저장 안 함
    it('runAgentLoop 실패 시 에러를 전파하고 DB에 저장하지 않는다', async () => {
      mockPrisma.project.findUniqueOrThrow.mockResolvedValue(project);
      mockPrisma.analysisDocument.count.mockResolvedValue(0);
      mockClaudeAgent.runAgentLoop.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1')).rejects.toThrow('CLAUDE_API_ERROR');
      expect(mockPrisma.analysisDocument.create).not.toHaveBeenCalled();
    });
  });
});
