import { Module } from '@nestjs/common';
import { GithubService } from './github.service';

// GithubModule: GitHub repo 생성 + 파일 push 기능을 묶는 모듈.
// PipelineModule에서 GithubService를 주입받아 Phase 4 완료 후 사용한다.
@Module({
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
