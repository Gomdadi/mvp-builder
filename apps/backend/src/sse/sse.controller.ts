import { Controller, MessageEvent, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SseService } from './sse.service';

// 파이프라인 진행 상황을 SSE(Server-Sent Events)로 실시간 전달하는 컨트롤러.
// main.ts의 setGlobalPrefix('v1')에 의해 실제 경로는 /v1/pipeline/:projectId/stream 이 된다.
@Controller('pipeline')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  // @Sse: 핸들러가 반환하는 Observable<MessageEvent>를 SSE 스트림으로 변환해 전송한다.
  // 클라이언트는 EventSource로 연결해 Worker가 publish하는 이벤트를 실시간 수신한다.
  @Sse(':projectId/stream')
  stream(@Param('projectId') projectId: string): Observable<MessageEvent> {
    return this.sseService.getStream(projectId);
  }
}
