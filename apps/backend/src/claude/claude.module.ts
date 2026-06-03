import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaudeAgentService } from './claude-agent.service';
import { Phase1Service } from './phase1.service';
import { Phase2Service } from './phase2.service';
import { Phase3Service } from './phase3.service';
import { Project } from '../entities/project.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { Task } from '../entities/task.entity';
import { S3Module } from '../s3/s3.module';
import { DockerModule } from '../docker/docker.module';

// ClaudeModule: Claude API 호출 관련 서비스를 묶는 모듈.
// Phase1/2/3Service가 공통으로 의존하는 ClaudeAgentService, S3Module, DockerModule을 여기서 관리한다.
// PipelineModule은 이 모듈을 import해 Phase 서비스들을 주입받는다.
@Module({
  imports: [
    // Phase1Service → Project, AnalysisDocument Repository
    // Phase2Service → AnalysisDocument, Task Repository
    // Phase3Service → Task, AnalysisDocument Repository
    TypeOrmModule.forFeature([Project, AnalysisDocument, Task]),
    S3Module,     // Phase3Service가 생성 코드를 S3에 업로드/다운로드
    DockerModule, // Phase3Service가 DockerSandboxService로 테스트 실행
  ],
  providers: [ClaudeAgentService, Phase1Service, Phase2Service, Phase3Service],
  // PipelineWorker가 직접 호출하는 서비스만 export — ClaudeAgentService는 내부 의존성이므로 제외
  exports: [Phase1Service, Phase2Service, Phase3Service],
})
export class ClaudeModule {}
