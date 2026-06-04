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
// static 필드(TOOL_BACKEND_TEST, TOOL_BACKEND_IMPL 등) 초기화 시점에도 호출되므로 모듈 로드 직후 기본값 설정
mockReadFileSync.mockReturnValue('mocked prompt');

// ClaudeAgentService mock — backend/frontend 모두 runAgentLoop 기반 TDD 루프 사용
const mockClaudeAgent = { runAgentLoop: jest.fn() };

// TypeORM Repository mock
const mockTaskRepo = { findOneOrFail: jest.fn(), update: jest.fn() };
const mockAnalysisDocumentRepo = { findOne: jest.fn() };

// S3Service mock — uploadGeneratedFile + 이전 구현 파일 주입에 쓰이는 list/download
const mockS3Service = {
  uploadGeneratedFile: jest.fn(),
  // 기본값: 이전 파일 없음 → 기존 테스트는 Existing Implementations 섹션 없이 동작
  listGeneratedFiles: jest.fn().mockResolvedValue([]),
  downloadGeneratedFile: jest.fn(),
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
// directoryStructure에는 구현 파일만 포함 — 테스트 파일은 Phase 3가 생성하므로 제외
const confirmedDoc = {
  id: 'doc-1',
  directoryStructure: [
    { path: 'src/user/user.entity.ts', role: 'TypeORM entity for User', dependencies: [] },
    { path: 'src/user/user.service.ts', role: 'User CRUD service', dependencies: ['src/user/user.entity.ts'] },
    { path: 'src/components/Button.tsx', role: 'Reusable Button component', dependencies: [] },
    { path: 'src/pages/LoginPage.tsx', role: 'Login page component', dependencies: ['src/components/Button.tsx'] },
  ],
  designSystem: null,
};

// Backend: generate_backend_test_code → generate_backend_implementation_code 루프 시뮬레이션
const simulateAgentLoop = async (options: any) => {
  await options.onToolCall('generate_backend_test_code', {
    test_path: 'src/user/user.service.spec.ts',
    test_code: 'describe("UserService") { ... }',
  });
  await options.onToolCall('generate_backend_implementation_code', {
    file_path: 'src/user/user.service.ts',
    code: 'export class UserService { ... }',
  });
};

// Frontend: generate_frontend_test_code → generate_frontend_implementation_code 루프 시뮬레이션
const simulateFrontendAgentLoop = async (options: any) => {
  await options.onToolCall('generate_frontend_test_code', {
    test_path: 'src/pages/LoginPage.test.tsx',
    test_code: 'describe("LoginPage") { ... }',
  });
  await options.onToolCall('generate_frontend_implementation_code', {
    file_path: 'src/pages/LoginPage.tsx',
    code: 'export function LoginPage() { ... }',
  });
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
    // clearAllMocks가 리턴값도 초기화하므로 기본값(이전 파일 없음) 재설정
    mockS3Service.listGeneratedFiles.mockResolvedValue([]);

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

      // boilerplate: generate_backend_implementation_code 툴로 환경 파일 생성
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_backend_implementation_code', {
          file_path: '_env/package.json',
          code: '{"name":"test"}',
        });
        await options.onToolCall('generate_backend_implementation_code', {
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

      // frontend boilerplate: generate_frontend_implementation_code 툴로 실제 프로젝트 파일 생성 (_env/ prefix 없음)
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_frontend_implementation_code', {
          file_path: 'package.json',
          code: '{"name":"frontend"}',
        });
        await options.onToolCall('generate_frontend_implementation_code', {
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

    it('이전 구현 파일이 있으면 userContent에 Existing Implementations 섹션을 포함한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      // 이전 task가 생성한 엔티티 파일이 S3에 존재
      mockS3Service.listGeneratedFiles.mockResolvedValue(['src/user/user.entity.ts']);
      mockS3Service.downloadGeneratedFile.mockResolvedValue('export class User { id: string; }');
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1', 'task-1');

      const callArgs = mockClaudeAgent.runAgentLoop.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('## Existing Implementations');
      expect(callArgs.messages[0].content).toContain('user.entity.ts');
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
        await options.onToolCall('generate_backend_test_code', {
          test_path: 'src/user/user.service.spec.ts',
          test_code: 'describe("UserService") { ... }',
        });
      });

      await expect(service.run('proj-1', 'task-1')).rejects.toThrow('Phase 3 backend incomplete');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-1' }, { status: 'FAILED' });
    });

    // ── Frontend (TDD) ───────────────────────────────────────────────────────────

    it('[frontend] test + component 2파일을 S3에 업로드한 뒤 task를 DONE으로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDocWithDesignSystem);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateFrontendAgentLoop);

      await service.run('proj-1', 'task-2');

      // test + component 2개 업로드, sandbox 없음
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1', 'src/pages/LoginPage.test.tsx', expect.any(String),
      );
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1', 'src/pages/LoginPage.tsx', expect.any(String),
      );
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-2' }, { status: 'DONE' });
    });

    it('[frontend] designSystem이 있으면 userContent에 포함해서 Claude에 전달한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDocWithDesignSystem);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateFrontendAgentLoop);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runAgentLoop.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('## Design System');
      expect(callArgs.messages[0].content).toContain('#6366F1');
    });

    it('[frontend] designSystem이 null이면 Design System 섹션 없이 정상 동작한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateFrontendAgentLoop);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runAgentLoop.mock.calls[0][0];
      expect(callArgs.messages[0].content).not.toContain('## Design System');
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
    });

    it('[frontend] test만 생성되고 component가 없으면 incomplete 에러 + FAILED로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        // test 파일만 생성, component 없음
        await options.onToolCall('generate_frontend_test_code', {
          test_path: 'src/pages/LoginPage.test.tsx',
          test_code: 'describe("LoginPage") { ... }',
        });
      });

      await expect(service.run('proj-1', 'task-2')).rejects.toThrow('Phase 3 frontend incomplete');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-2' }, { status: 'FAILED' });
    });

    it('[frontend] component만 생성되고 test가 없으면 incomplete 에러 + FAILED로 갱신한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        // component 파일만 생성, test 없음
        await options.onToolCall('generate_frontend_implementation_code', {
          file_path: 'src/pages/LoginPage.tsx',
          code: 'export function LoginPage() { ... }',
        });
      });

      await expect(service.run('proj-1', 'task-2')).rejects.toThrow('Phase 3 frontend incomplete');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-2' }, { status: 'FAILED' });
    });

    it('[frontend] 이전 구현 파일이 있으면 userContent에 Existing Implementations 섹션을 포함한다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      // 이전 task가 생성한 컴포넌트 파일이 S3에 존재
      mockS3Service.listGeneratedFiles.mockResolvedValue(['src/components/Button.tsx']);
      mockS3Service.downloadGeneratedFile.mockResolvedValue('export function Button() {}');
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateFrontendAgentLoop);

      await service.run('proj-1', 'task-2');

      const callArgs = mockClaudeAgent.runAgentLoop.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('## Existing Implementations');
      expect(callArgs.messages[0].content).toContain('Button.tsx');
    });

    it('[frontend] runAgentLoop 실패 시 FAILED로 갱신하고 S3 업로드를 하지 않는다', async () => {
      mockTaskRepo.findOneOrFail.mockResolvedValue(fakeFrontendTask);
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(confirmedDoc);
      mockTaskRepo.update.mockResolvedValue({});
      mockClaudeAgent.runAgentLoop.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'task-2')).rejects.toThrow('CLAUDE_API_ERROR');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockTaskRepo.update).toHaveBeenNthCalledWith(2, { id: 'task-2' }, { status: 'FAILED' });
    });
  });
});
