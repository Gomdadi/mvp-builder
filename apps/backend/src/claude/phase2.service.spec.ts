import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { Phase2Service } from './phase2.service';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';

// fs 모듈 전체를 mock — Phase2Service의 static 필드(TOOL)와 생성자에서 MD 파일을 읽는데,
// 테스트 환경에서는 실제 파일이 없을 수 있으므로 가짜 문자열을 반환하도록 교체
jest.mock('fs');
const mockReadFileSync = fs.readFileSync as jest.Mock;
// static 필드(TOOL) 초기화 시점에도 호출되므로 모듈 로드 직후 기본값 설정
mockReadFileSync.mockReturnValue('mocked prompt');

// ClaudeAgentService mock — 실제 Claude API 호출 없이 반환값만 지정해 로직 검증
const mockClaudeAgent = { runWithTool: jest.fn() };

// PrismaService mock — 실제 DB 없이 반환값을 지정해 로직만 검증
const mockPrisma = {
  analysisDocument: { findFirst: jest.fn() },
  task: { createMany: jest.fn() },
};

// isConfirmed=true인 확정 분석 문서 — findFirst의 반환값으로 사용
const confirmedDoc = {
  id: 'doc-1',
  erd: '## ERD',
  apiSpec: '## API',
  architecture: '## Arch',
  directoryStructure: [{ path: 'src/app.module.ts', role: 'Root module', dependencies: [] }],
};

// Claude가 반환할 가짜 태스크 목록
const fakeTasks = [
  { name: 'Setup Prisma schema', description: 'Define all models', order_index: 1, type: 'BACKEND' as const },
  { name: 'Implement UserService', description: 'CRUD for users', order_index: 2, type: 'BACKEND' as const },
  { name: 'Implement LoginPage', description: 'Login UI component', order_index: 3, type: 'FRONTEND' as const },
];

describe('Phase2Service', () => {
  let service: Phase2Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks가 mockReturnValue도 초기화하므로 매 테스트 전에 재설정
    mockReadFileSync.mockReturnValue('mocked prompt');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Phase2Service,
        { provide: ClaudeAgentService, useValue: mockClaudeAgent },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<Phase2Service>(Phase2Service);
  });

  describe('run', () => {
    // 정상 케이스: 확정 분석 문서가 있으면 태스크 목록을 생성하고 DB에 일괄 저장
    it('태스크 목록을 생성하고 DB에 일괄 저장한다', async () => {
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockPrisma.task.createMany.mockResolvedValue({ count: 2 });
      // runWithTool이 generate_tasks 툴의 결과를 반환하도록 설정
      mockClaudeAgent.runWithTool.mockResolvedValue({
        toolName: 'generate_tasks',
        toolInput: { tasks: fakeTasks },
      });

      await service.run('proj-1', 'run-1');

      // runWithTool이 generate_tasks 툴로 호출됐는지 검증
      expect(mockClaudeAgent.runWithTool).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'generate_tasks' }),
      );
      // createMany에 올바른 데이터가 넘어갔는지 검증
      // order_index(Claude 반환) → orderIndex(Prisma 필드명) 변환 및 type 저장 확인
      expect(mockPrisma.task.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: 'Setup Prisma schema', orderIndex: 1, type: 'BACKEND' }),
          expect.objectContaining({ name: 'Implement UserService', orderIndex: 2, type: 'BACKEND' }),
          expect.objectContaining({ name: 'Implement LoginPage', orderIndex: 3, type: 'FRONTEND' }),
        ],
      });
    });

    // 실패 케이스 1: isConfirmed=true인 분석 문서가 없으면 에러.
    // Phase 1 확정 없이 Phase 2를 실행하면 안 됨 — Claude 호출도 하지 않아야 함
    it('확정된 분석 문서가 없으면 에러를 던진다', async () => {
      // findFirst가 null을 반환 → 확정 문서 없음
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(null);

      await expect(service.run('proj-1', 'run-1')).rejects.toThrow(
        'No confirmed analysis document found',
      );
      // 확정 문서 없으면 Claude 호출 없이 에러만 던져야 함
      expect(mockClaudeAgent.runWithTool).not.toHaveBeenCalled();
    });

    // 실패 케이스 2: Claude API 자체가 실패한 경우.
    // 에러를 삼키지 않고 위로 전파하고, 불완전한 태스크를 DB에 저장하지 않아야 함
    it('Claude API 실패 시 에러를 전파하고 태스크를 저장하지 않는다', async () => {
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockClaudeAgent.runWithTool.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'run-1')).rejects.toThrow('CLAUDE_API_ERROR');
      // API 실패 시 DB 저장 없이 에러만 전파해야 함
      expect(mockPrisma.task.createMany).not.toHaveBeenCalled();
    });
  });
});
