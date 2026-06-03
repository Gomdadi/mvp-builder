import { Test } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { DockerSandboxService, DOCKER_INSTANCE } from './docker-sandbox.service';
import { GeneratedFile } from '../claude/phase3.service';

// fs/promises mock — writeFile, mkdir, rm이 실제 파일시스템에 접근하지 않도록 교체
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));
import * as fsMock from 'fs/promises';
const mockFsRm = fsMock.rm as jest.Mock;

// dockerode-compose mock — 생성자가 pull/up/down 메서드를 가진 인스턴스를 반환
const mockCompose = {
  pull: jest.fn().mockResolvedValue(undefined),
  up: jest.fn(),
  down: jest.fn().mockResolvedValue(undefined),
};
jest.mock('dockerode-compose', () => {
  return jest.fn().mockImplementation(() => mockCompose);
});

// ── 픽스처 헬퍼 ───────────────────────────────────────────────────────────────

// container mock 빌더 — 로그 스트림은 EventEmitter로 시뮬레이션
function buildContainerMock(opts: { exitCode: number; logs?: string }) {
  const logStream = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;

  // demuxStream: stdout writable에 로그를 write한 뒤 'end' 이벤트 발생으로 스트림 종료 시뮬레이션
  const modem = {
    demuxStream: (
      stream: EventEmitter,
      stdout: { write: (c: Buffer) => void },
      _stderr: unknown,
    ) => {
      if (opts.logs) stdout.write(Buffer.from(opts.logs));
      setImmediate(() => stream.emit('end'));
    },
  };

  return {
    logs: jest.fn().mockImplementation(
      (_opts: unknown, cb: (err: null, s: EventEmitter) => void) => cb(null, logStream),
    ),
    wait: jest.fn().mockResolvedValue({ StatusCode: opts.exitCode }),
    modem,
  };
}

// ── 공통 픽스처 ───────────────────────────────────────────────────────────────

const envFiles: GeneratedFile[] = [
  { filePath: '_env/docker-compose.yml', code: 'services:\n  test:\n    image: node:20-alpine' },
  { filePath: '_env/package.json', code: '{"name":"test"}' },
];

const codeFiles: GeneratedFile[] = [
  { filePath: 'src/user.service.spec.ts', code: 'it("passes", () => {})' },
  { filePath: 'src/user.service.ts', code: 'export class UserService {}' },
];

// dockerMock: docker 인스턴스는 DOCKER_INSTANCE 토큰으로 주입 — createContainer 등은 compose가 사용
const dockerMock = {};

describe('DockerSandboxService', () => {
  let service: DockerSandboxService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // fs mock 기본값 재설정 (clearAllMocks가 초기화하므로)
    (fsMock.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fsMock.writeFile as jest.Mock).mockResolvedValue(undefined);
    mockFsRm.mockResolvedValue(undefined);
    mockCompose.pull.mockResolvedValue(undefined);
    mockCompose.down.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerSandboxService,
        { provide: DOCKER_INSTANCE, useValue: dockerMock },
      ],
    }).compile();

    service = moduleRef.get(DockerSandboxService);
  });

  it('exit code 0이면 passed:true와 로그를 반환한다', async () => {
    const container = buildContainerMock({ exitCode: 0, logs: 'Tests: 1 passed' });
    mockCompose.up.mockResolvedValue({ services: [container] });

    const result = await service.runTest(envFiles, codeFiles);

    expect(result.passed).toBe(true);
    expect(result.output).toContain('Tests: 1 passed');
  });

  it('exit code 1이면 passed:false와 로그를 반환한다', async () => {
    const container = buildContainerMock({ exitCode: 1, logs: 'FAIL src/user.service.spec.ts' });
    mockCompose.up.mockResolvedValue({ services: [container] });

    const result = await service.runTest(envFiles, codeFiles);

    expect(result.passed).toBe(false);
    expect(result.output).toContain('FAIL');
  });

  it('성공 여부와 관계없이 compose.down()과 fs.rm()이 항상 호출된다', async () => {
    const container = buildContainerMock({ exitCode: 0 });
    mockCompose.up.mockResolvedValue({ services: [container] });

    await service.runTest(envFiles, codeFiles);

    expect(mockCompose.down).toHaveBeenCalledWith({ volumes: true });
    expect(mockFsRm).toHaveBeenCalledWith(
      expect.stringContaining('tmp'),
      { recursive: true, force: true },
    );
  });

  it('compose.down()이 실패해도 runTest()는 정상 결과를 반환한다', async () => {
    const container = buildContainerMock({ exitCode: 0 });
    mockCompose.up.mockResolvedValue({ services: [container] });
    mockCompose.down.mockRejectedValue(new Error('down failed'));

    // compose.down 실패가 상위로 전파되지 않아야 함
    await expect(service.runTest(envFiles, codeFiles)).resolves.toEqual(
      expect.objectContaining({ passed: true }),
    );
    // fs.rm은 compose.down 실패 후에도 호출되어야 함
    expect(mockFsRm).toHaveBeenCalled();
  });
});
