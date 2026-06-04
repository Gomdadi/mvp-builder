import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { Not, Repository } from 'typeorm';
import { Phase1Service } from '../claude/phase1.service';
import { Phase2Service } from '../claude/phase2.service';
import { Phase4Service } from '../claude/phase4.service';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { PipelinePhase, PipelineStatus, TaskStatus } from '../entities/enums';
import { PIPELINE_QUEUE, TASK_QUEUE, PipelineJobName, TaskJobName } from './pipeline.constants';

// @Processor: 이 클래스가 PIPELINE_QUEUE의 잡을 소비하는 Worker임을 선언
// BullMQ가 Redis 큐에서 잡을 꺼낼 때 process() 메서드를 자동으로 호출
@Processor(PIPELINE_QUEUE)
// WorkerHost: @nestjs/bullmq가 제공하는 기본 클래스. process() 메서드를 구현해야 함
export class PipelineWorker extends WorkerHost {
  private readonly logger = new Logger(PipelineWorker.name);

  constructor(
    private readonly phase1Service: Phase1Service,
    private readonly phase2Service: Phase2Service,
    private readonly phase4Service: Phase4Service,
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue,
    @InjectRepository(PipelineRun) private readonly pipelineRunRepo: Repository<PipelineRun>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
  ) {
    super();
  }

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
      case PipelineJobName.SANDBOX:
        await this.handleSandbox(job);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  // Phase 1 실행. 완료 시 PipelineRun.status=COMPLETED, 실패 시 FAILED
  private async handleStart(job: Job): Promise<void> {
    const { projectId, pipelineRunId } = job.data as { projectId: string; pipelineRunId: string };
    try {
      await this.phase1Service.run(projectId);
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.COMPLETED, completedAt: new Date() },
      );
      this.logger.log(`Phase 1 complete — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      throw e; // BullMQ retry 트리거
    }
  }

  // Phase 1 재실행 (피드백 반영). feedbackText를 Phase1Service에 전달
  private async handleFeedback(job: Job): Promise<void> {
    const { projectId, pipelineRunId, feedbackText } = job.data as {
      projectId: string;
      pipelineRunId: string;
      feedbackText: string;
    };
    try {
      await this.phase1Service.run(projectId, feedbackText);
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.COMPLETED, completedAt: new Date() },
      );
      this.logger.log(`Phase 1 (feedback) complete — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      throw e;
    }
  }

  // Phase 2 → Task 큐 enqueue.
  // Phase 2는 BullMQ 재시도(stalled) 시 중복 Task 생성을 방지하기 위해 Task count > 0이면 skip.
  // Phase 3 실행 및 PipelineRun 완료 판정은 TaskWorker가 담당
  private async handleConfirm(job: Job): Promise<void> {
    const { projectId, pipelineRunId } = job.data as { projectId: string; pipelineRunId: string };
    try {
      // BullMQ 재시도 시 Task count > 0이면 Phase 2 skip (idempotency)
      const existingCount = await this.taskRepo.count({ where: { pipelineRunId } });
      if (existingCount === 0) {
        await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_2 });
        await this.phase2Service.run(projectId, pipelineRunId);
      }

      // DONE 제외한 Tasks를 orderIndex 오름차순으로 task 큐에 enqueue
      // BullMQ 재시도 시 이미 DONE인 Task는 큐에 넣지 않음 (resume 전략)
      await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_3 });
      const tasks = await this.taskRepo.find({
        where: { pipelineRunId, status: Not(TaskStatus.DONE) },
        order: { orderIndex: 'ASC' },
      });

      for (const task of tasks) {
        await this.taskQueue.add(TaskJobName.RUN, { projectId, pipelineRunId, taskId: task.id }, { jobId: task.id });
      }

      this.logger.log(`Phase 2 complete, ${tasks.length} tasks enqueued — pipelineRunId=${pipelineRunId}`);
      // PipelineRun COMPLETED 판정은 TaskWorker → SANDBOX 잡 → handleSandbox()가 담당
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      throw e;
    }
  }

  // Phase 4: 전체 생성 파일의 종합 sandbox 검증.
  // TaskWorker가 모든 Task DONE 후 enqueue하며, 통과 시 PipelineRun COMPLETED 처리
  private async handleSandbox(job: Job): Promise<void> {
    const { projectId, pipelineRunId } = job.data as { projectId: string; pipelineRunId: string };
    try {
      await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_4 });
      await this.phase4Service.run(projectId);
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.COMPLETED, completedAt: new Date() },
      );
      this.logger.log(`Phase 4 complete — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      throw e;
    }
  }
}
