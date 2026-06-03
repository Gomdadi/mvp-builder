import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { PipelineWorker } from './pipeline.worker';
import { PIPELINE_QUEUE } from './pipeline.constants';
import { Project } from '../entities/project.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';

@Module({
  imports: [
    // BullModule.registerQueue: 이 모듈에서 사용할 큐를 등록
    // defaultJobOptions: 이 큐에 등록되는 모든 잡에 공통으로 적용되는 옵션
    BullModule.registerQueue({
      name: PIPELINE_QUEUE,
      defaultJobOptions: {
        attempts: 3,                                    // 실패 시 최대 3번 재시도
        backoff: { type: 'exponential', delay: 2000 }, // 재시도 간격: 2s → 4s → 8s
        removeOnComplete: 100, // 완료된 잡을 Redis에 최대 100개만 보관
        removeOnFail: 200,     // 실패한 잡을 Redis에 최대 200개만 보관
      },
    }),

    // TypeOrmModule.forFeature: 이 모듈에서 사용할 엔티티의 Repository를 DI에 등록
    // 등록된 엔티티는 @InjectRepository(Entity)로 주입받을 수 있음
    TypeOrmModule.forFeature([Project, AnalysisDocument, PipelineRun, Task]),
  ],
  controllers: [PipelineController],
  // PipelineWorker는 HTTP 요청을 처리하지 않지만 BullMQ가 DI로 관리해야 해서 providers에 등록
  providers: [PipelineService, PipelineWorker],
  exports: [PipelineService],
})
export class PipelineModule {}
