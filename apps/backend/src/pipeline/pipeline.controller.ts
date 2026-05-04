import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

// @Controller('pipeline'): 이 클래스의 모든 라우트는 /v1/pipeline으로 시작 (global prefix v1 포함)
@Controller('pipeline')
export class PipelineController {
  // private readonly: 클래스 내부에서만 접근 가능하고 재할당 불가. 생성자 파라미터에 붙이면 자동으로 프로퍼티 선언 + DI 주입
  constructor(private readonly pipelineService: PipelineService) {}

  // @Post(':projectId/start'): POST /v1/pipeline/:projectId/start 라우트 등록
  // :projectId는 URL 파라미터 — 실제 요청 시 /v1/pipeline/abc-123/start 형태
  @Post(':projectId/start')
  // @HttpCode: 기본 응답 코드(200)를 202로 변경. 잡을 등록만 하고 처리는 비동기로 진행됨을 의미
  @HttpCode(HttpStatus.ACCEPTED)
  // @Param('projectId'): URL의 :projectId 값을 projectId 변수로 추출
  start(@Param('projectId') projectId: string) {
    return this.pipelineService.start(projectId);
  }
}
