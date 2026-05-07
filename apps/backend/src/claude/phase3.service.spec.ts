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

// ClaudeAgentService mock — 실제 Claude API 호출 없이 onToolCall 콜백만 테스트
const mockClaudeAgent = { runAgentLoop: jest.fn() };

// PrismaService mock — 실제 DB 없이 반환값을 지정해 로직만 검증
const mockPrisma = {
  task: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  analysisDocument: { findFirst: jest.fn() },
};

// S3Service mock — S3 키 패턴 검증은 S3Service 자체 테스트에서 수행.
// 여기서는 올바른 인자로 uploadGeneratedFile이 호출됐는지만 확인
const mockS3Service = { uploadGeneratedFile: jest.fn() };

// 테스트용 태스크 데이터
const fakeTask = {
  id: 'task-1',
  name: 'Implement UserService CRUD',
  description: 'Implement CRUD for src/user/user.service.ts',
};

// isConfirmed=true인 확정 분석 문서 — findFirst의 반환값
const confirmedDoc = {
  id: 'doc-1',
  directoryStructure: [
    { path: 'src/user/user.service.ts', role: 'User CRUD service', dependencies: [] },
    { path: 'src/user/user.service.spec.ts', role: 'User service tests', dependencies: ['src/user/user.service.ts'] },
  ],
};

// Claude가 generate_test_code → generate_implementation_code 순서로 호출하는 루프 시뮬레이션.
// 실제 루프 대신 onToolCall 콜백을 직접 순서대로 호출해
// Phase3Service의 파일 수집 로직과 S3 업로드·DB 업데이트 흐름을 검증함
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
    // 정상 케이스: 테스트 코드 → 구현 코드 순서로 생성 후 S3에 2개 파일 업로드, task DONE
    it('테스트·구현 코드를 생성하고 S3에 업로드한 뒤 task를 DONE으로 갱신한다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);
      mockPrisma.task.update.mockResolvedValue({ ...fakeTask, status: 'DONE' });
      mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);

      await service.run('proj-1', 'run-1', 'task-1');

      // S3Service.uploadGeneratedFile이 테스트·구현 파일 각각 올바른 인자로 호출됐는지 검증
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(2);
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1',
        'src/user/user.service.spec.ts',
        'describe("UserService") { ... }',
      );
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledWith(
        'proj-1',
        'src/user/user.service.ts',
        'export class UserService { ... }',
      );
      // task status가 DONE으로 업데이트됐는지 검증
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'DONE' },
      });
    });

    // 실패 케이스 1: isConfirmed=true인 분석 문서가 없으면 에러.
    // 디렉토리 구조 없이는 Claude에게 올바른 컨텍스트를 줄 수 없으므로 즉시 에러를 던져야 함
    it('확정된 분석 문서가 없으면 에러를 던진다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(null);

      await expect(service.run('proj-1', 'run-1', 'task-1')).rejects.toThrow(
        'No confirmed analysis document found',
      );
      // 확정 문서 없으면 Claude 호출 없이 에러만 던져야 함
      expect(mockClaudeAgent.runAgentLoop).not.toHaveBeenCalled();
    });

    // 실패 케이스 2: 에이전트 루프가 일찍 종료되어 파일 1개만 생성된 경우.
    // 불완전한 상태로 S3 업로드나 task 업데이트를 하면 안 됨
    it('파일이 2개 미만으로 생성되면 에러를 던지고 S3 업로드를 하지 않는다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      // generate_test_code만 호출하고 generate_implementation_code는 생략 — 루프 조기 종료 시뮬레이션
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_test_code', {
          test_path: 'src/user/user.service.spec.ts',
          test_code: 'describe("UserService") { ... }',
        });
      });

      await expect(service.run('proj-1', 'run-1', 'task-1')).rejects.toThrow(
        'Phase 3 incomplete',
      );
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    // 실패 케이스 3: Claude API 자체가 실패한 경우.
    // 에러를 삼키지 않고 위로 전파하고, S3 업로드와 task 업데이트를 하지 않아야 함
    it('Claude API 실패 시 에러를 전파하고 S3 업로드와 task 업데이트를 하지 않는다', async () => {
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue(fakeTask);
      mockPrisma.analysisDocument.findFirst.mockResolvedValue(confirmedDoc);
      mockClaudeAgent.runAgentLoop.mockRejectedValue(new Error('CLAUDE_API_ERROR'));

      await expect(service.run('proj-1', 'run-1', 'task-1')).rejects.toThrow('CLAUDE_API_ERROR');
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });
  });
});
