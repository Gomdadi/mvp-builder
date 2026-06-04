import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Phase4Service } from './phase4.service';
import { ClaudeAgentService } from './claude-agent.service';
import { S3Service } from '../s3/s3.service';
import { DockerSandboxService } from '../docker/docker-sandbox.service';
import { AnalysisDocument } from '../entities/analysis-document.entity';

// fs 모듈 mock — 생성자 및 static 필드에서 prompts MD 파일을 읽으므로 대체
jest.mock('fs');
const mockReadFileSync = fs.readFileSync as jest.Mock;
mockReadFileSync.mockReturnValue('mocked prompt');

// ClaudeAgentService mock — debug loop에서 runAgentLoop 사용
const mockClaudeAgent = { runAgentLoop: jest.fn() };

// AnalysisDocument Repository mock
const mockAnalysisDocumentRepo = { findOneOrFail: jest.fn() };

// S3Service mock — listGeneratedFiles, downloadGeneratedFile, uploadGeneratedFile
const mockS3Service = {
  listGeneratedFiles: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  uploadGeneratedFile: jest.fn(),
};

// DockerSandboxService mock
const mockDockerSandbox = { runTest: jest.fn() };

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const confirmedDoc = {
  id: 'doc-1',
  directoryStructure: [
    { path: 'src/user/user.service.ts', role: 'User service', dependencies: [] },
    { path: 'src/user/user.service.spec.ts', role: 'User service tests', dependencies: [] },
  ],
  isConfirmed: true,
  version: 1,
};

// S3 파일 목록 픽스처
const fakeFilePaths = [
  '_env/docker-compose.yml',
  '_env/package.json',
  '_env/tsconfig.json',
  'src/user/user.service.ts',
  'src/user/user.service.spec.ts',
];

const fakeFileCodes: Record<string, string> = {
  '_env/docker-compose.yml': 'version: "3"\nservices:\n  test:\n    image: node:20',
  '_env/package.json': '{"name":"test"}',
  '_env/tsconfig.json': '{"compilerOptions":{}}',
  'src/user/user.service.ts': 'export class UserService {}',
  'src/user/user.service.spec.ts': 'describe("UserService", () => { it("works", () => {}); });',
};

describe('Phase4Service', () => {
  let service: Phase4Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue('mocked prompt');

    // 기본 mock 설정
    mockAnalysisDocumentRepo.findOneOrFail.mockResolvedValue(confirmedDoc);
    mockS3Service.listGeneratedFiles.mockResolvedValue(fakeFilePaths);
    mockS3Service.downloadGeneratedFile.mockImplementation((_projectId: string, fp: string) =>
      Promise.resolve(fakeFileCodes[fp] ?? ''),
    );
    mockS3Service.uploadGeneratedFile.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Phase4Service,
        { provide: ClaudeAgentService, useValue: mockClaudeAgent },
        { provide: getRepositoryToken(AnalysisDocument), useValue: mockAnalysisDocumentRepo },
        { provide: S3Service, useValue: mockS3Service },
        { provide: DockerSandboxService, useValue: mockDockerSandbox },
      ],
    }).compile();

    service = module.get<Phase4Service>(Phase4Service);
  });

  describe('run', () => {
    it('listGeneratedFiles가 반환한 파일 전체(보일러플레이트 포함)가 sandbox codeFiles에 전달된다', async () => {
      mockDockerSandbox.runTest.mockResolvedValue({ passed: true, output: 'Tests passed' });

      await service.run('proj-1');

      // envFiles는 빈 배열, codeFiles에 5개 파일 모두 포함
      expect(mockDockerSandbox.runTest).toHaveBeenCalledWith(
        [],
        expect.arrayContaining(
          fakeFilePaths.map((fp) => expect.objectContaining({ filePath: fp })),
        ),
      );
    });

    it('sandbox 통과 시 FileMap 전체를 S3에 재업로드하고 return한다', async () => {
      mockDockerSandbox.runTest.mockResolvedValue({ passed: true, output: 'Tests passed' });

      await service.run('proj-1');

      // 5개 파일 모두 재업로드
      expect(mockS3Service.uploadGeneratedFile).toHaveBeenCalledTimes(fakeFilePaths.length);
    });

    it('sandbox 실패 시 runAgentLoop(debug loop)를 호출한다', async () => {
      // 1회 실패 → 2회째 성공
      mockDockerSandbox.runTest
        .mockResolvedValueOnce({ passed: false, output: 'FAIL: expected 1 received 2' })
        .mockResolvedValueOnce({ passed: true, output: 'Tests passed' });
      mockClaudeAgent.runAgentLoop.mockResolvedValue(undefined);

      await service.run('proj-1');

      // debug loop 1회 실행
      expect(mockClaudeAgent.runAgentLoop).toHaveBeenCalledTimes(1);
      // debug loop 옵션 검증 — 에러 출력과 파일 목록이 user content에 포함
      const loopOptions = mockClaudeAgent.runAgentLoop.mock.calls[0][0];
      expect(loopOptions.messages[0].content).toContain('FAIL: expected 1 received 2');
      expect(loopOptions.messages[0].content).toContain('src/user/user.service.ts');
    });

    it('debug loop에서 *.spec.ts 수정 시도를 거부한다', async () => {
      let rejectionMessage = '';

      // sandbox: 실패 → 성공
      mockDockerSandbox.runTest
        .mockResolvedValueOnce({ passed: false, output: 'FAIL' })
        .mockResolvedValueOnce({ passed: true, output: 'OK' });

      // runAgentLoop mock: generate_implementation_code를 spec.ts로 호출하는 시나리오 시뮬레이션
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        rejectionMessage = await options.onToolCall('generate_implementation_code', {
          file_path: 'src/user/user.service.spec.ts',
          code: 'modified test',
        });
      });

      await service.run('proj-1');

      expect(rejectionMessage).toContain('Rejected');
      expect(rejectionMessage).toContain('test files');
    });

    it('debug loop에서 read_files 콜백이 FileMap 내용을 반환한다', async () => {
      let readResult = '';

      mockDockerSandbox.runTest
        .mockResolvedValueOnce({ passed: false, output: 'FAIL' })
        .mockResolvedValueOnce({ passed: true, output: 'OK' });

      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        readResult = await options.onToolCall('read_files', {
          file_paths: ['src/user/user.service.ts'],
        });
      });

      await service.run('proj-1');

      expect(readResult).toContain('src/user/user.service.ts');
      expect(readResult).toContain('export class UserService {}');
    });

    it('debug loop에서 수정된 파일이 다음 sandbox 실행에 반영된다', async () => {
      const fixedCode = 'export class UserService { fixed = true; }';

      mockDockerSandbox.runTest
        .mockResolvedValueOnce({ passed: false, output: 'FAIL' })
        .mockResolvedValueOnce({ passed: true, output: 'OK' });

      // generate_implementation_code로 FileMap 업데이트
      mockClaudeAgent.runAgentLoop.mockImplementation(async (options: any) => {
        await options.onToolCall('generate_implementation_code', {
          file_path: 'src/user/user.service.ts',
          code: fixedCode,
        });
      });

      await service.run('proj-1');

      // 2번째 sandbox 실행 시 수정된 코드가 포함되어야 함
      const secondCall = mockDockerSandbox.runTest.mock.calls[1][1] as Array<{ filePath: string; code: string }>;
      const updatedFile = secondCall.find((f) => f.filePath === 'src/user/user.service.ts');
      expect(updatedFile?.code).toBe(fixedCode);
    });

    it('SANDBOX_MAX_RETRIES 이후에도 실패하면 에러를 던진다', async () => {
      // 모든 시도 실패
      mockDockerSandbox.runTest.mockResolvedValue({ passed: false, output: 'FAIL' });
      mockClaudeAgent.runAgentLoop.mockResolvedValue(undefined);

      await expect(service.run('proj-1')).rejects.toThrow(
        'Phase 4 sandbox failed after 10 retries',
      );

      // 10회 sandbox 실행, 9회 debug loop (마지막 실패 후에는 debug loop 없음)
      expect(mockDockerSandbox.runTest).toHaveBeenCalledTimes(10);
      expect(mockClaudeAgent.runAgentLoop).toHaveBeenCalledTimes(9);
      // 실패 시 S3 재업로드 없음
      expect(mockS3Service.uploadGeneratedFile).not.toHaveBeenCalled();
    });

    it('S3 파일 다운로드 실패 시 해당 파일을 skip하고 나머지로 계속 진행한다', async () => {
      // 첫 번째 파일만 다운로드 실패
      mockS3Service.downloadGeneratedFile.mockImplementation((_projectId: string, fp: string) => {
        if (fp === '_env/docker-compose.yml') return Promise.reject(new Error('Not found'));
        return Promise.resolve(fakeFileCodes[fp] ?? '');
      });
      mockDockerSandbox.runTest.mockResolvedValue({ passed: true, output: 'OK' });

      // 에러 없이 정상 완료
      await expect(service.run('proj-1')).resolves.toBeUndefined();

      // docker-compose.yml 제외한 4개 파일만 FileMap에 포함
      const codeFiles = mockDockerSandbox.runTest.mock.calls[0][1] as Array<{ filePath: string }>;
      expect(codeFiles).not.toContainEqual(
        expect.objectContaining({ filePath: '_env/docker-compose.yml' }),
      );
    });
  });
});
