import { Module } from '@nestjs/common';
import Dockerode = require('dockerode');
import { DockerSandboxService, DOCKER_INSTANCE } from './docker-sandbox.service';

// DockerModule
// Dockerode 인스턴스를 DOCKER_INSTANCE 토큰으로 provide해 DI 가능하게 한다.
// DockerSandboxService를 export해 Phase3Module에서 사용할 수 있게 한다.
@Module({
  providers: [
    {
      provide: DOCKER_INSTANCE,
      // /var/run/docker.sock을 통해 호스트 Docker 데몬에 접근
      useFactory: () => new Dockerode({ socketPath: '/var/run/docker.sock' }),
    },
    DockerSandboxService,
  ],
  exports: [DockerSandboxService],
})
export class DockerModule {}
