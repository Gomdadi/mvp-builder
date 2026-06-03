import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
// esModuleInterop 미설정 환경에서 CJS 모듈을 올바르게 import하는 방식
import Dockerode = require('dockerode');
import { GeneratedFile } from '../claude/phase3.service';

// dockerode-compose는 @types 없음 — CJS 모듈이므로 import = require 방식 사용
import DockerodeCompose = require('dockerode-compose');

// NestJS DI 토큰 — 테스트에서 dockerode 인스턴스를 mock으로 교체할 수 있게 함
export const DOCKER_INSTANCE = 'DOCKER_INSTANCE';

export interface SandboxResult {
  passed: boolean;
  output: string;
}

// DockerSandboxService
// Claude가 생성한 docker-compose.yml을 dockerode-compose로 실행해 테스트 결과를 반환한다.
// 파일은 /tmp/{uuid}/ 임시 디렉토리에 저장하고, docker-compose volumes로 컨테이너에 마운트한다.
// 컨테이너 생명주기(네트워크, 볼륨 포함)는 dockerode-compose + dockerode가 관리한다.
@Injectable()
export class DockerSandboxService {
  private readonly logger = new Logger(DockerSandboxService.name);

  constructor(@Inject(DOCKER_INSTANCE) private readonly docker: Dockerode) {}

  // 환경 파일 + 코드 파일을 임시 디렉토리에 저장하고 docker-compose로 테스트를 실행한다.
  // envFiles: S3에서 받은 보일러플레이트 파일들 (_env/docker-compose.yml 필수 포함)
  // codeFiles: test + impl 파일
  async runTest(envFiles: GeneratedFile[], codeFiles: GeneratedFile[]): Promise<SandboxResult> {
    const tmpDir = path.join(os.tmpdir(), randomUUID());
    // 프로젝트 이름은 UUID — 동시에 여러 샌드박스가 실행될 때 네트워크/컨테이너 이름 충돌 방지
    const projectName = randomUUID().replace(/-/g, '').slice(0, 12);

    await fs.mkdir(tmpDir, { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let compose: any = null;
    try {
      await this.writeFiles(tmpDir, envFiles, codeFiles);

      const composeFilePath = path.join(tmpDir, 'docker-compose.yml');
      compose = new DockerodeCompose(this.docker, composeFilePath, projectName);

      // image가 로컬에 없으면 pull — 이미 있으면 빠르게 완료
      await compose.pull();
      // 컨테이너 생성 + 시작. 반환값: { services: Dockerode.Container[], networks: [...], ... }
      const upResult = await compose.up();

      const containers: Dockerode.Container[] = upResult.services ?? [];
      if (containers.length === 0) {
        throw new Error('docker-compose up produced no containers');
      }

      // 로그 수집과 종료 대기를 병렬로 실행 — logs(follow:true)는 컨테이너 종료까지 스트림 유지
      const [output, waitResult] = await Promise.all([
        this.collectLogs(containers[0]),
        containers[0].wait(),
      ]);

      const exitCode = (waitResult as { StatusCode: number }).StatusCode;
      this.logger.log(`Sandbox exit code=${exitCode} project=${projectName}`);
      return { passed: exitCode === 0, output };
    } finally {
      // 성공/실패/예외 관계없이 컨테이너·네트워크 정리 후 임시 디렉토리 삭제
      if (compose) {
        try {
          await compose.down({ volumes: true });
        } catch (e) {
          this.logger.warn(`compose.down failed: ${(e as Error).message}`);
        }
      }
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (e) {
        this.logger.warn(`tmpDir removal failed: ${(e as Error).message}`);
      }
    }
  }

  // 모든 파일을 tmpDir 하위에 저장한다.
  // _env/ prefix가 있는 파일은 prefix를 제거해 tmpDir 루트에 위치시킨다.
  // (예: _env/docker-compose.yml → tmpDir/docker-compose.yml)
  private async writeFiles(
    tmpDir: string,
    envFiles: GeneratedFile[],
    codeFiles: GeneratedFile[],
  ): Promise<void> {
    const allFiles = [...envFiles, ...codeFiles];
    await Promise.all(
      allFiles.map(async (file) => {
        // _env/ prefix 제거 — 보일러플레이트 파일들을 tmpDir 루트로 배치
        const strippedPath = file.filePath.startsWith('_env/')
          ? file.filePath.slice(5)
          : file.filePath;
        const dest = path.join(tmpDir, strippedPath);
        // 중간 디렉토리가 없으면 생성
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, file.code, 'utf-8');
      }),
    );
  }

  // 컨테이너 로그(stdout + stderr)를 문자열로 수집한다.
  // follow: true — 컨테이너가 종료될 때까지 스트림 유지
  private collectLogs(container: Dockerode.Container): Promise<string> {
    return new Promise((resolve, reject) => {
      container.logs(
        { stdout: true, stderr: true, follow: true },
        (err, stream) => {
          if (err) return reject(err);
          if (!stream) return resolve('');

          const chunks: Buffer[] = [];
          // dockerode 로그 스트림은 Multiplexed stream — demuxStream으로 stdout/stderr 분리 필요
          container.modem.demuxStream(
            stream,
            { write: (chunk: Buffer) => chunks.push(chunk) },
            { write: (chunk: Buffer) => chunks.push(chunk) },
          );

          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          stream.on('error', reject);
        },
      );
    });
  }
}
