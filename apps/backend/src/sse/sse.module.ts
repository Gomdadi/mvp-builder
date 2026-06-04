import { Module } from '@nestjs/common';
import { SseController } from './sse.controller';
import { SseService } from './sse.service';

// SseModule: 파이프라인 진행 상황 SSE 실시간 스트리밍 기능을 묶는 모듈.
// SseService는 in-process Subject 방식으로 동작하므로 별도 Redis 커넥션 불필요.
// SseService는 PipelineModule의 Worker가 publish() 호출용으로 쓰므로 exports에 포함한다.
@Module({
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
