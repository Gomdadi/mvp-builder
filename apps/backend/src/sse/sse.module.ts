import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SseController } from './sse.controller';
import { SseService } from './sse.service';
import { SSE_REDIS_PUB, SSE_REDIS_SUB } from './sse.constants';

// SseModule: 파이프라인 진행 상황 SSE 실시간 스트리밍 기능을 묶는 모듈.
// session.module.ts와 동일하게 BullMQ와 분리된 별도 ioredis 커넥션을 useFactory로 생성한다.
// pub/sub은 전용 커넥션이 각각 필요하다(SUBSCRIBE 모드 커넥션은 다른 명령 불가).
// SseService는 PipelineModule의 Worker가 publish() 호출용으로 쓰므로 exports에 포함한다.
@Module({
  controllers: [SseController],
  providers: [
    {
      // SSE_REDIS_PUB: PUBLISH 전용 ioredis 커넥션
      provide: SSE_REDIS_PUB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        }),
    },
    {
      // SSE_REDIS_SUB: SUBSCRIBE 전용 ioredis 커넥션 (PUBLISH 커넥션과 반드시 분리)
      provide: SSE_REDIS_SUB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        }),
    },
    SseService,
  ],
  exports: [SseService],
})
export class SseModule {}
