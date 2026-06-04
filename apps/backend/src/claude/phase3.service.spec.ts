import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Phase3Service } from './phase3.service';
import { ClaudeAgentService } from './claude-agent.service';
import { S3Service } from '../s3/s3.service';
import { Task } from '../entities/task.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { TaskType } from '../entities/enums';

// fs 모듈 전체를 mock — Phase3Service의 static 필드(TOOL)와 생성자에서 MD 파일을 읽는데,
// 테스트 환경에서는 실제 파일이 없을 수 있으므로 가짜 문자열을 반환하도록 교체
jest.mock('fs');
const mockReadFileSync = fs.readFileSync as jest.Mock;
// static 필드(TOOL_TEST, TOOL_IMPL) 초기화 시점에도 호출되므로 모듈 로드 직후 기본값 설정
mockReadFileSync.mockReturnValue('mocked prompt');

// ClaudeAgentService mock — backend: runAgentLoop, frontend: runWithTool
const mockClaudeAgent = { runAgentLoop: jest.fn(), runWithTool: jest.fn() };

// TypeORM Repository mock
const mockTaskRepo = { findOneOrFail: jest.fn(), update: jest.fn() };
const mockAnalysisDocumentRepo = { findOne: jest.fn() };

// S3Service mock — uploadGeneratedFile만 사용 (Phase3는 sandbox 없음)
const mockS3Service = {
  uploadGeneratedFile: jest.fn(),
};

// ── 테스트 픽스처 ─────────────────────────────────────────────────────────────

// 일반 백엔드 태스크 (orderIndex=1 이상)
const fakeTask = {
  id: 'task-1',
  name: 'Implement UserService CRUD',
  description: 'Implement CRUD for src/user/user.service.ts',
  type: 'BACKEND' as const,
  orderIndex: 1,
};

// 백엔드 보일러플레이트 태스크 (orderIndex=0, type=BACKEND)
const fakeBoilerplateTask = {
  id: 'task-0',
  name: 'Set up project boilerplate',
  description: 'Generate package.json, tsconfig.json, jest.config.js',
  type: TaskType.BACKEND,
  orderIndex: 0,
};

// 프론트엔드 보일러플레이트 태스크 (orderIndex=0, type=FRONTEND)
const fakeFrontendBoilerplateTask = {
  id: 'task-fe-bp',
  name: 'Set up frontend boilerplate',
  description: 'Generate frontend project files',
  type: TaskType.FRONTEND,
  orderIndex: 0,
};

// isConfirmed=true인 확정 분석 문서
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

const fakeFrontendTask = {
  id: 'task-2',
  name: 'Implement LoginPage',
  description: 'Login UI at src/pages/LoginPage.tsx',
  type: 'FRONTEND' as const,
  orderIndex: 5,
};

const confirmedDocWithDesignSystem = {
  ...confirmedDoc,
  designSystem: '## Design System\n### Colors\n- Primary: #6366F1',
};

describe('Phase3Service', () => {
  let service: Phase3Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue('mocked prompt');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Phase3Service,
        { provide: ClaudeAgentService, useValue: mockClaudeAgent },
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
        { provide: getRepositoryToken(AnalysisDocument), useValue: mockAnalysisDocumentRepo },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<Phase3Service>(Phase3Service);
  });

  describe('run', () => {
    // ── 보일러플레이트 ─────────────────────────────────────────────────────────

    it('[boilerplate] orderIndex=0이면 환경 파일을 생성하고 S3에 저장한 뒤 DONE으로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeBoilerplateTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});

      // boilerplate: generate_implementation_code 툴로 환경 파일 생성
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_implementation_code', {
          file_path: '_env/package.json',
          code: '{"name":"test"}',
        });
        await options.onToolCall('generate_implementation_code', {
          file_path: '_env/tsconfig.json',
          code: '{"compilerOptions":{}}',
        });
      });

      await service.run('proj-1', 'task-0');

      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith('proj-1', '_env/package.json', '{"name":"test"}');
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-0' }, { status: 'DONE' });
    });

    it('[boilerplate] 파일이 하나도 생성되지 않으면 FAILED로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeBoilerplateTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      // 툴 호출 없이 루프 종료
      mockClaudeAgent.runAgentLoop.mockImplementation(async () => {});

      await expect(service.run('proj-1', 'task-0')).rejects.toThrow('Boilerplate task generated no files');
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-0' }, { status: 'FAILED' });
    });

    // ── 프론트엔드 보일러플레이트 ─────────────────────────────────────────────────

    it('[frontend boilerplate] orderIndex=0 FRONTEND이면 프론트엔드 기반 파일을 생성하고 DONE으로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendBoilerplateTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});

      // frontend boilerplate: generate_implementation_code 툴로 실제 프로젝트 파일 생성 (_env/ prefix 없음)
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_implementation_code', {
          file_path: 'package.json',
          code: '{"name":"frontend"}',
        });
        await options.onToolCall('generate_implementation_code', {
          file_path: 'vite.config.ts',
          code: 'export default {}',
        });
      });

      await service.run('proj-1', 'task-fe-bp');

      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith('proj-1', 'package.json', '{"name":"frontend"}');
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith('proj-1', 'vite.config.ts', 'export default {}');
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-fe-bp' }, { status: 'DONE' });
    });

    it('[frontend boilerplate] 파일이 하나도 생성되지 않으면 FAILED로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendBoilerplateTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      // 툴 호출 없이 루프 종료
      mockClaudeAgent.runAgentLoop.mockImplementation(async () => {});

      await expect(service.run('proj-1', 'task-fe-bp')).rejects.toThrow('Boilerplate task generated no files');
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-fe-bp' }, { status: 'FAILED' });
    });

    // ── Backend 정상 케이스 ────────────────────────────────────────────────────

    it('sandbox 없이 test + impl을 S3에 업로드하고 DONE으로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1', 'task-1');

      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(1, { id: 'task-1' }, { status: 'IN_PROGRESS' });
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-1' }, { status: 'DONE' });
      // test + impl 2개 업로드, sandbox 없음
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1', 'src/user/user.service.spec.ts', expect.any(String),
      );
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1', 'src/user/user.service.ts', expect.any(String),
      );
    });

    // ── Backend 실패 케이스 ────────────────────────────────────────────────────

    it('실행 중 에러 발생 시 task를 FAILED로 갱신하고 에러를 전파한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow('CLAUDE_API_ERROR');

      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-1' }, { status: 'FAILED' });
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
    });

    it('확정된 분석 문서가 없으면 에러를 던진다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(null);

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow(
        'No confirmed analysis document found',
      );
      expect(mockClaudeAgent.runAgentLoop).not.toHaveBeenCalled();
    });

    it('파일이 2개 미만으로 생성되면 FAILED로 갱신하고 S3 업로드를 하지 않는다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        // test 파일만 생성, impl 없음
        await options.onToolCall('generate_test_code', {
          test_path: 'src/user/user.service.spec.ts',
          test_code: 'describe("UserService") { ... }',
        });
      });

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow('Phase 3 backend incomplete');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-1' }, { status: 'FAILED' });
    });

    // ── Frontend ───────────────────────────────────────────────────────────────

    it('[frontend] 컴포넌트를 생성하고 S3에 업로드한 뒤 task를 DONE으로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDocWithDesignSystem);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockResolvedValue(frontendToolResult);

      await service.run('proj-1', 'task-2');

      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(1);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1',
        'src/pages/LoginPage.tsx',
        'export function LoginPage() { ... }',
      );
      expect(mockTaskRepo.update).toHaveBeenCalledWith({ id: 'task-2' }, { status: 'DONE' });
    });

    it('[frontend] designSystem이 있으면 userContent에 포함해서 Claude에 전달한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDocWithDesignSystem);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockResolvedValue(frontendToolResult);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runWithTool.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('## Design System');
      expect(callArgs.messages[0].content).toContain('#6366F1');
    });

    it('[frontend] designSystem이 null이면 Design System 섹션 없이 정상 동작한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockResolvedValue(frontendToolResult);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runWithTool.mock.calls[0][0];
      expect(callArgs.messages[0].content).not.toContain('## Design System');
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(1);
    });

    it('[frontend] runWithTool 실패 시 FAILED로 갱신하고 S3 업로드를 하지 않는다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runWithTool.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'task-2')).rejects.toThrow('CLAUDE_API_ERROR');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-2' }, { status: 'FAILED' });
    });
  });
});
