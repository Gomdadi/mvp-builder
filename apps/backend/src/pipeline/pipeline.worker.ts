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
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { PipelinePhase, PipelineStatus, TaskStatus } from '../entities/enums';
import { PIPELINE_QUEUE, TASK_QUEUE, PipelineJobName, TaskJobName } from './pipeline.constants';
import { SessionService } from '../session/session.service';
import { GithubService } from '../github/github.service';
import { S3Service } from '../s3/s3.service';
import { SseService } from '../sse/sse.service';
import { SseEvent } from '../sse/sse.types';

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
    private readonly sessionService: SessionService,
    private readonly githubService: GithubService,
    private readonly s3Service: S3Service,
    // SseService: 파이프라인 진행 상황을 Redis pub/sub으로 SSE 클라이언트에 실시간 전달
    private readonly sseService: SseService,
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue,
    @InjectRepository(PipelineRun) private readonly pipelineRunRepo: Repository<PipelineRun>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
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
    const { projectId, pipelineRunId, sessionId } = job.data as {
      projectId: string;
      pipelineRunId: string;
      sessionId?: string;
    };
    try {
      // 세션에서 claudeApiKey를 꺼낸다. 없으면 env 키 fallback (ClaudeAgentService 내부 처리)
      const session = await this.sessionService.getSession(sessionId ?? '');
      // Phase 1 시작을 SSE로 알림
      await this.sseService.publish(projectId, this.event('phase_started', { phase: PipelinePhase.PHASE_1 }));
      await this.phase1Service.run(projectId, undefined, session?.claudeApiKey);
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.COMPLETED, completedAt: new Date() },
      );
      // Phase 1 완료 통지 — 스트림은 유지 (confirm 후 Phase 2~4까지 동일 스트림으로 이어짐)
      await this.sseService.publish(projectId, this.event('phase_completed', { phase: PipelinePhase.PHASE_1 }));
      this.logger.log(`Phase 1 complete — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      // 실패를 SSE로 알리고 스트림 종료
      await this.sseService.publish(projectId, this.event('pipeline_failed', { message: (e as Error).message }));
      await this.sseService.complete(projectId);
      throw e; // BullMQ retry 트리거
    }
  }

  // Phase 1 재실행 (피드백 반영). feedbackText를 Phase1Service에 전달
  private async handleFeedback(job: Job): Promise<void> {
    const { projectId, pipelineRunId, feedbackText, sessionId } = job.data as {
      projectId: string;
      pipelineRunId: string;
      feedbackText: string;
      sessionId?: string;
    };
    try {
      const session = await this.sessionService.getSession(sessionId ?? '');
      // Phase 1 (피드백) 재시작을 SSE로 알림
      await this.sseService.publish(projectId, this.event('phase_started', { phase: PipelinePhase.PHASE_1 }));
      await this.phase1Service.run(projectId, feedbackText, session?.claudeApiKey);
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.COMPLETED, completedAt: new Date() },
      );
      // Phase 1 완료 통지 — 스트림은 유지
      await this.sseService.publish(projectId, this.event('phase_completed', { phase: PipelinePhase.PHASE_1 }));
      this.logger.log(`Phase 1 (feedback) complete — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      await this.sseService.publish(projectId, this.event('pipeline_failed', { message: (e as Error).message }));
      await this.sseService.complete(projectId);
      throw e;
    }
  }

  // Phase 2 → Task 큐 enqueue.
  // Phase 2는 BullMQ 재시도(stalled) 시 중복 Task 생성을 방지하기 위해 Task count > 0이면 skip.
  // Phase 3 실행 및 PipelineRun 완료 판정은 TaskWorker가 담당
  private async handleConfirm(job: Job): Promise<void> {
    const { projectId, pipelineRunId, sessionId } = job.data as {
      projectId: string;
      pipelineRunId: string;
      sessionId?: string;
    };
    try {
      const session = await this.sessionService.getSession(sessionId ?? '');

      // BullMQ 재시도 시 Task count > 0이면 Phase 2 skip (idempotency)
      const existingCount = await this.taskRepo.count({ where: { pipelineRunId } });
      if (existingCount === 0) {
        await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_2 });
        // Phase 2 시작을 SSE로 알림
        await this.sseService.publish(projectId, this.event('phase_started', { phase: PipelinePhase.PHASE_2 }));
        await this.phase2Service.run(projectId, pipelineRunId, session?.claudeApiKey);
      }

      // DONE 제외한 Tasks를 orderIndex 오름차순으로 task 큐에 enqueue
      // BullMQ 재시도 시 이미 DONE인 Task는 큐에 넣지 않음 (resume 전략)
      await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_3 });
      // Phase 2 완료 → Phase 3 시작을 SSE로 알림 (개별 Task 진행은 TaskWorker가 emit)
      await this.sseService.publish(projectId, this.event('phase_completed', { phase: PipelinePhase.PHASE_2 }));
      await this.sseService.publish(projectId, this.event('phase_started', { phase: PipelinePhase.PHASE_3 }));
      const tasks = await this.taskRepo.find({
        where: { pipelineRunId, status: Not(TaskStatus.DONE) },
        order: { orderIndex: 'ASC' },
      });

      for (const task of tasks) {
        await this.taskQueue.add(
          TaskJobName.RUN,
          { projectId, pipelineRunId, taskId: task.id, sessionId },
          { jobId: task.id },
        );
      }

      this.logger.log(`Phase 2 complete, ${tasks.length} tasks enqueued — pipelineRunId=${pipelineRunId}`);
      // PipelineRun COMPLETED 판정은 TaskWorker → SANDBOX 잡 → handleSandbox()가 담당
      // 스트림은 Phase 3/4까지 이어지므로 여기서 complete()하지 않는다
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      // 실패를 SSE로 알리고 스트림 종료
      await this.sseService.publish(projectId, this.event('pipeline_failed', { message: (e as Error).message }));
      await this.sseService.complete(projectId);
      throw e;
    }
  }

  // Phase 4: 전체 생성 파일의 종합 sandbox 검증 후 GitHub push.
  // TaskWorker가 모든 Task DONE 후 enqueue하며, sandbox 통과 + GitHub push 성공 시 PipelineRun COMPLETED
  private async handleSandbox(job: Job): Promise<void> {
    const { projectId, pipelineRunId, sessionId } = job.data as {
      projectId: string;
      pipelineRunId: string;
      sessionId?: string;
    };

    // 세션 조회는 try 외부 — finally에서 sessionId로 삭제해야 하므로
    const session = await this.sessionService.getSession(sessionId ?? '');

    try {
      await this.pipelineRunRepo.update({ id: pipelineRunId }, { phase: PipelinePhase.PHASE_4 });
      // Phase 4 시작을 SSE로 알림
      await this.sseService.publish(projectId, this.event('phase_started', { phase: PipelinePhase.PHASE_4 }));
      await this.phase4Service.run(projectId, session?.claudeApiKey);

      // Phase 4 통과 후 GitHub repo 생성 + 생성 코드 push.
      // pushToGitHub가 repo URL을 반환하면 pipeline_completed 이벤트에 포함한다.
      let githubRepoUrl: string | undefined;
      if (session?.githubToken) {
        githubRepoUrl = await this.pushToGitHub(projectId, session.githubToken, session.isPrivate);
      } else {
        this.logger.warn(`No githubToken in session — skipping GitHub push for project ${projectId}`);
      }

      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.COMPLETED, completedAt: new Date() },
      );
      // Phase 4 완료 → 파이프라인 전체 성공을 SSE로 알리고 스트림 종료. githubRepoUrl 포함
      await this.sseService.publish(projectId, this.event('phase_completed', { phase: PipelinePhase.PHASE_4 }));
      await this.sseService.publish(projectId, this.event('pipeline_completed', { githubRepoUrl }));
      await this.sseService.complete(projectId);
      this.logger.log(`Phase 4 complete — pipelineRunId=${pipelineRunId}`);
    } catch (e) {
      await this.pipelineRunRepo.update(
        { id: pipelineRunId },
        { status: PipelineStatus.FAILED, errorMessage: (e as Error).message },
      );
      // 실패를 SSE로 알리고 스트림 종료
      await this.sseService.publish(projectId, this.event('pipeline_failed', { message: (e as Error).message }));
      await this.sseService.complete(projectId);
      throw e;
    } finally {
      // 성공/실패 무관하게 민감 정보(GitHub PAT, Claude API Key) 즉시 삭제
      if (sessionId) {
        await this.sessionService.deleteSession(sessionId);
        this.logger.log(`Session deleted — sessionId=${sessionId}`);
      }
    }
  }

  // S3의 생성 파일을 다운로드해 GitHub repo에 push하고 Project.githubRepoUrl을 업데이트한다.
  // 생성된 repo URL을 반환해 호출부(handleSandbox)가 pipeline_completed 이벤트에 포함할 수 있게 한다.
  private async pushToGitHub(projectId: string, githubToken: string, isPrivate: boolean): Promise<string> {
    const project = await this.projectRepo.findOneOrFail({ where: { id: projectId } });

    // Project.name을 GitHub repo 이름으로 변환 — kebab-case, 특수문자 제거
    const repoName = project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100); // GitHub repo 이름 최대 100자 제한

    // S3에서 전체 생성 파일 다운로드 (병렬)
    const filePaths = await this.s3Service.listGeneratedFiles(projectId);
    const files = await Promise.all(
      filePaths.map(async (fp) => ({
        path: fp,
        content: await this.s3Service.downloadGeneratedFile(projectId, fp),
      })),
    );

    const repoUrl = await this.githubService.pushFiles(githubToken, repoName, isPrivate, files);

    // DB에 repo URL 저장 — 이후 사용자가 링크를 확인할 수 있도록
    await this.projectRepo.update({ id: projectId }, { githubRepoUrl: repoUrl, githubRepoName: repoName });
    this.logger.log(`GitHub repo URL saved — projectId=${projectId} url=${repoUrl}`);
    return repoUrl;
  }

  // SseEvent 생성 헬퍼 — timestamp(ISO 8601)를 자동으로 채워 type/추가 필드와 합친다.
  private event(type: SseEvent['type'], extra: Partial<SseEvent> = {}): SseEvent {
    return { type, timestamp: new Date().toISOString(), ...extra };
  }
}
