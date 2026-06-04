import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { PipelineWorker } from './pipeline.worker';
import { TaskWorker } from './task.worker';
import { PIPELINE_QUEUE, TASK_QUEUE } from './pipeline.constants';
import { Project } from '../entities/project.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { ClaudeModule } from '../claude/claude.module';
import { SessionModule } from '../session/session.module';
import { GithubModule } from '../github/github.module';
import { S3Module } from '../s3/s3.module';

// defaultJobOptions 공통 옵션 — PIPELINE_QUEUE, TASK_QUEUE 둘 다 동일하게 적용
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,                                    // 실패 시 최대 3번 재시도
  backoff: { type: 'exponential', delay: 2000 }, // 재시도 간격: 2s → 4s → 8s
  removeOnComplete: 100,
  removeOnFail: 200,
};

@Module({
  imports: [
    ClaudeModule,    // Phase1/2/3Service 제공
    SessionModule,   // SessionService — Worker가 Redis에서 apiKey/githubToken 조회
    GithubModule,    // GithubService — Phase 4 완료 후 repo 생성 + push
    S3Module,        // S3Service — GitHub push 시 생성 파일 다운로드

    // BullModule.registerQueue: 이 모듈에서 사용할 큐를 등록
    BullModule.registerQueue(
      { name: PIPELINE_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      // TASK_QUEUE: Phase 3 코드 생성 잡. TaskWorker가 concurrency:1로 직렬 소비
      { name: TASK_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),

    // TypeOrmModule.forFeature: 이 모듈에서 사용할 엔티티의 Repository를 DI에 등록
    // 등록된 엔티티는 @InjectRepository(Entity)로 주입받을 수 있음
    TypeOrmModule.forFeature([Project, AnalysisDocument, PipelineRun, Task]),
  ],
  controllers: [PipelineController],
  // Worker들은 HTTP 요청을 처리하지 않지만 BullMQ가 DI로 관리해야 해서 providers에 등록
  providers: [PipelineService, PipelineWorker, TaskWorker],
  exports: [PipelineService],
})
export class PipelineModule {}
