import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { Phase3Service } from './phase3.service';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

// fs 모듈 전체를 mock — Phase3Service의 static 필드(TOOL)와 생성자에서 MD 파일을 읽는데,
// 테스트 환경에서는 실제 파일이 없을 수 있으므로 가짜 문자열을 반환하도록 교체
jest.mock('fs');
const mockReadFileSync = fs.readFileSync as jest.Mock;
// static 필드(TOOL_TEST, TOOL_IMPL) 초기화 시점에도 호출되므로 모듈 로드 직후 기본값 설정
mockReadFileSync.mockReturnValue('mocked prompt');

// ClaudeAgentService mock — backend: runAgentLoop, frontend: runWithTool
const mockClaudeAgent = { runAgentLoop: jest.fn(), runWithTool: jest.fn() };

// PrismaService mock — 실제 DB 없이 반환값을 지정해 로직만 검증
const mockPrisma = {
  task: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  analysisDocument: { findFirst: jest.fn() },
};

// S3Service mock — S3 키 패턴 검증은 S3Service 자체 테스트에서 수행.
// 여기서는 올바른 인자로 uploadGeneratedFile이 호출됐는지만 확인
const mockS3Service = { uploadGeneratedFile: jest.fn() };

// 테스트용 백엔드 태스크 데이터
const fakeTask = {
  id: 'task-1',
  name: 'Implement UserService CRUD',
  description: 'Implement CRUD for src/user/user.service.ts',
  type: 'BACKEND' as const,
};

// isConfirmed=true인 확정 분석 문서 — findFirst의 반환값
const confirmedDoc = {
  id: 'doc-1',
  directoryStructure: [
    { path: 'src/user/user.service.ts', role: 'User CRUD service', dependencies: [] },
    { path: 'src/user/user.service.spec.ts', role: 'User service tests', dependencies: ['src/user/user.service.ts'] },
  ],
  designSystem: null,
};

// Backend: generate_test_code → generate_implementation_code 루프 시뮬레이션
const simulateAgentLoop = async (options: any) => {
  await options.onToolCall('generate_test_code', {
    test_path: 'src/user/user.service.spec.ts',
    test_code: 'describe("UserService") { ... }',
  });
  await options.onToolCall('generate_implementation_code', {
    file_path: 'src/user/user.service.ts',
    code: 'export class UserService { ... }',
  });
};

// Frontend: runWithTool 반환값
const frontendToolResult = {
  toolName: 'generate_ui_component',
  toolInput: {
    file_path: 'src/pages/LoginPage.tsx',
    code: 'export function LoginPage() { ... }',
  },
};

// 테스트용 프론트엔드 태스크 데이터
const fakeFrontendTask = {
  id: 'task-2',
  name: 'Implement LoginPage',
  description: 'Login UI at src/pages/LoginPage.tsx',
  type: 'FRONTEND' as const,
};

// design system이 포함된 확정 분석 문서
const confirmedDocWithDesignSystem = {
  ...confirmedDoc,
  designSystem: '## Design System\n### Colors\n- Primary: #6366F1',
};

describe('Phase3Service', () => {
  let service: Phase3Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks가 mockReturnValue도 초기화하므로 매 테스트 전에 재설정
    mockReadFileSync.mockReturnValue('mocked prompt');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Phase3Service,
        { provide: ClaudeAgentService, useValue: mockClaudeAgent },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<Phase3Service>(Phase3Service);
  });

  describe('run', () => {
    // 정상 케이스: IN_PROGRESS → 생성 → S3 업로드 → DONE
    it('테스트·구현 코드를 생성하고 S3에 업로드한 뒤 task를 DONE으로 갱신한다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockPrisma.task.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1', 'task-1');

      // IN_PROGRESS → DONE 순서로 두 번 업데이트됐는지 검증
      expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'task-1' },
        data: { status: 'IN_PROGRESS' },
      });
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'task-1' },
        data: { status: 'DONE' },
      });
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
    });

    // FAILED 케이스: 실행 중 에러 발생 시 task를 FAILED로 갱신하고 에러를 전파
    it('실행 중 에러 발생 시 task를 FAILED로 갱신하고 에러를 전파한다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockPrisma.task.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow('CLAUDE_API_ERROR');

      expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'task-1' },
        data: { status: 'IN_PROGRESS' },
      });
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'task-1' },
        data: { status: 'FAILED' },
      });
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
    });

    // 실패 케이스 1: isConfirmed=true인 분석 문서가 없으면 에러.
    // 디렉토리 구조 없이는 Claude에게 올바른 컨텍스트를 줄 수 없으므로 즉시 에러를 던져야 함
    it('확정된 분석 문서가 없으면 에러를 던진다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(null);

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow(
        'No confirmed analysis document found',
      );
      // 확정 문서 없으면 Claude 호출 없이 에러만 던져야 함
      expect(mockClaudeAgent.runAgentLoop).not.toHaveBeenCalled();
    });

    // 실패 케이스 2: 에이전트 루프가 일찍 종료되어 파일 1개만 생성된 경우.
    // S3 업로드 없이 IN_PROGRESS → FAILED로 상태 전환
    it('파일이 2개 미만으로 생성되면 FAILED로 갱신하고 S3 업로드를 하지 않는다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockPrisma.task.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_test_code', {
          test_path: 'src/user/user.service.spec.ts',
          test_code: 'describe("UserService") { ... }',
        });
      });

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow('Phase 3 backend incomplete');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'task-1' }, data: { status: 'IN_PROGRESS' },
      });
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'task-1' }, data: { status: 'FAILED' },
      });
    });


    // Frontend 정상 케이스: FRONTEND 태스크는 runWithTool로 컴포넌트를 생성하고
    // design system을 주입한 뒤 S3 업로드 후 task DONE
    it('[frontend] 컴포넌트를 생성하고 S3에 업로드한 뒤 task를 DONE으로 갱신한다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeFrontendTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDocWithDesignSystem);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockPrisma.task.update.mockResolvedValue({ ...fakeFrontendTask, status: 'DONE' });
      mockClaudeAgent.runWithTool.mockResolvedValue(frontendToolResult);

      await service.run('proj-1', 'task-2');

      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(1);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1',
        'src/pages/LoginPage.tsx',
        'export function LoginPage() { ... }',
      );
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-2' },
        data: { status: 'DONE' },
      });
    });

    // Frontend design system 주입: designSystem이 있으면 runWithTool의 messages에 포함됨
    it('[frontend] designSystem이 있으면 userContent에 포함해서 Claude에 전달한다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeFrontendTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDocWithDesignSystem);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockPrisma.task.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockResolvedValue(frontendToolResult);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runWithTool.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('## Design System');
      expect(callArgs.messages[0].content).toContain('#6366F1');
    });

    // Frontend designSystem null: designSystem이 없어도 정상 동작
    it('[frontend] designSystem이 null이면 Design System 섹션 없이 정상 동작한다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeFrontendTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc); // designSystem: null
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockPrisma.task.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockResolvedValue(frontendToolResult);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runWithTool.mock.calls[0][0];
      expect(callArgs.messages[0].content).not.toContain('## Design System');
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(1);
    });

    // Frontend 실패 케이스: runWithTool이 실패하면 FAILED로 갱신하고 S3 업로드를 하지 않는다
    it('[frontend] runWithTool 실패 시 FAILED로 갱신하고 S3 업로드를 하지 않는다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeFrontendTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockPrisma.task.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'task-2')).rejects.toThrow('CLAUDE_API_ERROR');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'task-2' }, data: { status: 'IN_PROGRESS' },
      });
      expect(mockPrisma.task.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'task-2' }, data: { status: 'FAILED' },
      });
    });
  });
});
