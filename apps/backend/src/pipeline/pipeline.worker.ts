import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PIPELINE_QUEUE, PipelineJobName } from './pipeline.constants';

// @Processor: 이 클래스가 PIPELINE_QUEUE의 잡을 소비하는 Worker임을 선언
// BullMQ가 Redis 큐에서 잡을 꺼낼 때 process() 메서드를 자동으로 호출
@Processor(PIPELINE_QUEUE)
// WorkerHost: @nestjs/bullmq가 제공하는 기본 클래스. process() 메서드를 구현해야 함
export class PipelineWorker extends WorkerHost {
  // Logger: NestJS 내장 로거. 클래스 이름을 컨텍스트로 지정하면 로그에 [PipelineWorker]가 붙음
  private readonly logger = new Logger(PipelineWorker.name);

  // BullMQ가 잡을 꺼낼 때마다 호출. job.name으로 잡 종류를 구분해 핸들러로 분기
  async process(job: Job): Promise<void> {
    this.logger.log(`Processing job [${job.name}] projectId=${job.data.projectId}`);

    switch (job.name) {
      case PipelineJobName.START:
        await this.handleStart(job);
        break;
      case PipelineJobName.FEEDBACK:
        await this.handleFeedback(job);
        break;
      case PipelineJobName.CONFIRM:
        await this.handleConfirm(job);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  // T-E6-02, T-E7-02에서 구현
  private async handleStart(job: Job): Promise<void> {
    this.logger.log(`Phase 1 stub — projectId=${job.data.projectId}`);
  }

  // T-E7-02에서 구현
  private async handleFeedback(job: Job): Promise<void> {
    this.logger.log(`Phase 1 re-run stub — projectId=${job.data.projectId}`);
  }

  // T-E7-02에서 구현
  private async handleConfirm(job: Job): Promise<void> {
    this.logger.log(`Phase 2→3 stub — projectId=${job.data.projectId}`);
  }
}
