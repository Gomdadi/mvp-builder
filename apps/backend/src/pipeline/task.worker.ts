import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { In, Repository } from 'typeorm';
import { Phase3Service } from '../claude/phase3.service';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { PipelineStatus, TaskStatus } from '../entities/enums';
import { TASK_QUEUE } from './pipeline.constants';

// concurrency: 1 — FIFO 직렬 처리로 orderIndex 순서를 보장한다.
// Phase 3 Task는 보일러플레이트(orderIndex=0) → 백엔드/프론트엔드 순서로 처리되어야 하므로 직렬이 필수
@Processor(TASK_QUEUE, { concurrency: 1 })
export class TaskWorker extends WorkerHost {
  private readonly logger = new Logger(TaskWorker.name);

  constructor(
    private readonly phase3Service: Phase3Service,
    @InjectRepository(PipelineRun) private readonly pipelineRunRepo: Repository<PipelineRun>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.handleRun(job);
  }

  // Phase 3 코드 생성 실행.
  // phase3Service.run()이 내부에서 Task.status=DONE or FAILED를 갱신.
  // finally 블록에서 PipelineRun 완료 판정 — DONE+FAILED 합계가 totalTasks에 도달하면 종료 처리
  private async handleRun(job: Job): Promise<void> {
    const { projectId, pipelineRunId, taskId } = job.data as {
      projectId: string;
      pipelineRunId: string;
      taskId: string;
    };

    this.logger.log(`Task start — taskId=${taskId} pipelineRunId=${pipelineRunId}`);

    try {
      await this.phase3Service.run(projectId, taskId);
      this.logger.log(`Task complete — taskId=${taskId}`);
    } catch (e) {
      // phase3Service.run()이 예외 발생 전 Task.status=FAILED 갱신을 처리
      this.logger.error(`Task failed — taskId=${taskId}: ${(e as Error).message}`);
      throw e; // BullMQ retry 트리거 (attempts 소진 시 Task.status=FAILED 유지)
    } finally {
      // DONE 또는 FAILED 상태인 Task 수가 totalTasks와 같으면 PipelineRun 종료 처리
      await this.finalizePipelineIfComplete(pipelineRunId);
    }
  }

  // Task 테이블을 count 두 번으로 완료 여부 판정 — totalTasks 별도 저장 불필요
  private async finalizePipelineIfComplete(pipelineRunId: string): Promise<void> {
    try {
      const total = await this.taskRepo.count({ where: { pipelineRunId } });
      const doneOrFailed = await this.taskRepo.count({
        where: { pipelineRunId, status: In([TaskStatus.DONE, TaskStatus.FAILED]) },
      });

      if (doneOrFailed < total) return;

      // 모든 Task 처리 완료 — FAILED가 하나라도 있으면 PipelineRun도 FAILED
      const failedCount = await this.taskRepo.count({
        where: { pipelineRunId, status: TaskStatus.FAILED },
      });
      const finalStatus = failedCount > 0 ? PipelineStatus.FAILED : PipelineStatus.COMPLETED;

      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: finalStatus, completedAt: new Date() },
      );
      this.logger.log(`PipelineRun ${finalStatus} — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      this.logger.error(`finalizePipelineIfComplete error: ${(e as Error).message}`);
    }
  }
}
