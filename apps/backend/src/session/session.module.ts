import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SESSION_REDIS } from './session.constants';

// SessionModule: 세션(GitHub PAT + Claude API Key) 임시 저장 기능을 묶는 모듈.
// BullMQ와 분리된 별도 ioredis 커넥션을 useFactory로 생성해 SessionService에 주입한다.
// SessionService는 PipelineWorker/TaskWorker에서도 쓰이므로 exports에 포함한다.
@Module({
  controllers: [SessionController],
  providers: [
    {
      // SESSION_REDIS: BullMQ와 동일한 Redis 서버에 직접 명령(set/get/del)을 보내는 별도 커넥션
      provide: SESSION_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        }),
    },
    SessionService,
  ],
  exports: [SessionService],
})
export class SessionModule {}
