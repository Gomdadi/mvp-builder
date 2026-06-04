import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { PipelineWorker } from './pipeline.worker';
import { TASK_QUEUE, PipelineJobName, TaskJobName } from './pipeline.constants';
import { Phase1Service } from '../claude/phase1.service';
import { Phase2Service } from '../claude/phase2.service';
import { Phase4Service } from '../claude/phase4.service';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { PipelinePhase, PipelineStatus, TaskStatus } from '../entities/enums';
import { PIPELINE_QUEUE } from './pipeline.constants';
import { SessionService } from '../session/session.service';
import { GithubService } from '../github/github.service';
import { S3Service } from '../s3/s3.service';
import { SseService } from '../sse/sse.service';

const mockPhase1Service = { run: jest.fn() };
const mockPhase2Service = { run: jest.fn() };
const mockPhase4Service = { run: jest.fn() };
// 기본 getSession → null (세션 없음, env 키 fallback)
const mockSessionService = { getSession: jest.fn().mockResolvedValue(null), deleteSession: jest.fn() };
const mockGithubService = { pushFiles: jest.fn() };
const mockS3Service = { listGeneratedFiles: jest.fn(), downloadGeneratedFile: jest.fn() };
// SseService mock — publish/complete는 비동기. 이벤트 emit 호출만 흡수
const mockSseService = { publish: jest.fn().mockResolvedValue(undefined), complete: jest.fn().mockResolvedValue(undefined) };
const mockTaskQueue = { add: jest.fn() };
const mockPipelineRunRepo = { update: jest.fn() };
const mockTaskRepo = { count: jest.fn(), find: jest.fn() };
const mockProjectRepo = { findOneOrFail: jest.fn(), update: jest.fn() };

const makeJob = (name: string, data: object) => ({ name, data });

describe('PipelineWorker', () => {
  let worker: PipelineWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessionService.getSession.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        PipelineWorker,
        { provide: Phase1Service, useValue: mockPhase1Service },
        { provide: Phase2Service, useValue: mockPhase2Service },
        { provide: Phase4Service, useValue: mockPhase4Service },
        { provide: SessionService, useValue: mockSessionService },
        { provide: GithubService, useValue: mockGithubService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: SseService, useValue: mockSseService },
        { provide: getQueueToken(TASK_QUEUE), useValue: mockTaskQueue },
        { provide: getRepositoryToken(PipelineRun), useValue: mockPipelineRunRepo },
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
      ],
    }).compile();
    worker = module.get(PipelineWorker);
  });

  describe('handleStart', () => {
    const job = makeJob(PipelineJobName.START, { projectId: 'p1', pipelineRunId: 'run-1' });

    it('Phase1Service.run 호출 후 PipelineRun을 COMPLETED로 갱신한다', async () => {
      mockPhase1Service.run.mockResolvedValue('doc-id-123');

      await worker.process(job as any);

      // sessionId 없으므로 claudeApiKey는 undefined (env 키 fallback)
      expect(mockPhase1Service.run).toHaveBeenCalledWith('p1', undefined, undefined);
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.COMPLETED }),
      );
      // phase_completed PHASE_1 이벤트에 phase1Service.run 반환값(analysisDocumentId) 포함 검증
      expect(mockSseService.publish).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          type: 'phase_completed',
          phase: PipelinePhase.PHASE_1,
          analysisDocumentId: 'doc-id-123',
        }),
      );
    });

    it('Phase1Service.run 실패 시 PipelineRun을 FAILED로 갱신하고 예외를 re-throw한다', async () => {
      mockPhase1Service.run.mockRejectedValue(new Error('claude error'));

      await expect(worker.process(job as any)).rejects.toThrow('claude error');
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.FAILED }),
      );
    });
  });

  describe('handleFeedback', () => {
    const job = makeJob(PipelineJobName.FEEDBACK, {
      projectId: 'p1',
      pipelineRunId: 'run-1',
      feedbackText: 'ERD 수정 필요',
    });

    it('Phase1Service.run에 feedbackText를 전달하고 COMPLETED로 갱신한다', async () => {
      mockPhase1Service.run.mockResolvedValue('doc-id-456');

      await worker.process(job as any);

      expect(mockPhase1Service.run).toHaveBeenCalledWith('p1', 'ERD 수정 필요', undefined);
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.COMPLETED }),
      );
      // 피드백 재실행 후 phase_completed PHASE_1 이벤트에 새 analysisDocumentId 포함 검증
      expect(mockSseService.publish).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          type: 'phase_completed',
          phase: PipelinePhase.PHASE_1,
          analysisDocumentId: 'doc-id-456',
        }),
      );
    });
  });

  describe('handleConfirm', () => {
    const job = makeJob(PipelineJobName.CONFIRM, { projectId: 'p1', pipelineRunId: 'run-1' });
    const fakeTasks = [
      { id: 't1', name: 'Task A', status: TaskStatus.PENDING },
      { id: 't2', name: 'Task B', status: TaskStatus.FAILED },
    ];

    it('Tasks가 없으면 Phase2를 실행하고 Task들을 큐에 enqueue한다', async () => {
      mockTaskRepo.count.mockResolvedValueOnce(0); // existingCount
      mockPhase2Service.run.mockResolvedValue(undefined);
      mockTaskRepo.find.mockResolvedValue(fakeTasks);
      mockTaskQueue.add.mockResolvedValue(undefined);

      await worker.process(job as any);

      expect(mockPhase2Service.run).toHaveBeenCalledWith('p1', 'run-1', undefined);
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        { phase: PipelinePhase.PHASE_3 },
      );
      expect(mockTaskQueue.add).toHaveBeenCalledTimes(2);
      // job data에 taskName 포함 검증 (TaskWorker가 이벤트에 사용)
      expect(mockTaskQueue.add).toHaveBeenCalledWith(
        TaskJobName.RUN,
        expect.objectContaining({ taskId: 't1', taskName: 'Task A' }),
        { jobId: 't1' },
      );
      // phase_completed PHASE_2 이벤트에 pipelineRunId 포함 검증
      expect(mockSseService.publish).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          type: 'phase_completed',
          phase: PipelinePhase.PHASE_2,
          pipelineRunId: 'run-1',
        }),
      );
    });

    it('Tasks가 이미 있으면 Phase2를 skip하고 DONE 제외 Tasks만 enqueue한다', async () => {
      mockTaskRepo.count.mockResolvedValueOnce(3); // existingCount > 0 → Phase 2 skip
      const nonDoneTasks = [{ id: 't2', name: 'Task B', status: TaskStatus.PENDING }];
      mockTaskRepo.find.mockResolvedValue(nonDoneTasks);

      await worker.process(job as any);

      expect(mockPhase2Service.run).not.toHaveBeenCalled();
      expect(mockTaskQueue.add).toHaveBeenCalledTimes(1);
      expect(mockTaskQueue.add).toHaveBeenCalledWith(
        TaskJobName.RUN,
        expect.objectContaining({ taskId: 't2', taskName: 'Task B' }),
        { jobId: 't2' },
      );
    });

    it('Phase2 실패 시 PipelineRun을 FAILED로 갱신하고 예외를 re-throw한다', async () => {
      mockTaskRepo.count.mockResolvedValueOnce(0);
      mockPhase2Service.run.mockRejectedValue(new Error('phase2 error'));

      await expect(worker.process(job as any)).rejects.toThrow('phase2 error');
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.FAILED }),
      );
    });
  });

  describe('handleSandbox', () => {
    const job = makeJob(PipelineJobName.SANDBOX, { projectId: 'p1', pipelineRunId: 'run-1' });

    it('Phase4Service.run 완료 시 PipelineRun을 PHASE_4 → COMPLETED로 갱신한다', async () => {
      mockPhase4Service.run.mockResolvedValue(undefined);

      await worker.process(job as any);

      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        { phase: PipelinePhase.PHASE_4 },
      );
      // sessionId 없으므로 claudeApiKey는 undefined
      expect(mockPhase4Service.run).toHaveBeenCalledWith('p1', undefined);
      // githubToken 없으므로 GitHub push 미실행
      expect(mockGithubService.pushFiles).not.toHaveBeenCalled();
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.COMPLETED }),
      );
    });

    it('Phase4Service.run 실패 시 PipelineRun을 FAILED로 갱신하고 예외를 re-throw한다', async () => {
      mockPhase4Service.run.mockRejectedValue(new Error('sandbox failed'));

      await expect(worker.process(job as any)).rejects.toThrow('sandbox failed');
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.FAILED }),
      );
    });

    it('세션에 githubToken이 있으면 GitHub push를 실행한다', async () => {
      const fakeSession = { githubToken: 'ghp_xxx', claudeApiKey: 'sk-ant-xxx', isPrivate: false };
      mockSessionService.getSession.mockResolvedValue(fakeSession);
      mockPhase4Service.run.mockResolvedValue(undefined);
      mockProjectRepo.findOneOrFail.mockResolvedValue({ id: 'p1', name: 'My App' });
      mockS3Service.listGeneratedFiles.mockResolvedValue(['src/index.ts']);
      mockS3Service.downloadGeneratedFile.mockResolvedValue('console.log("hi")');
      mockGithubService.pushFiles.mockResolvedValue('https://github.com/user/my-app');

      await worker.process(makeJob(PipelineJobName.SANDBOX, { projectId: 'p1', pipelineRunId: 'run-1', sessionId: 'sid-1' }) as any);

      expect(mockGithubService.pushFiles).toHaveBeenCalledWith(
        'ghp_xxx',
        'my-app',
        false,
        [{ path: 'src/index.ts', content: 'console.log("hi")' }],
      );
      expect(mockProjectRepo.update).toHaveBeenCalledWith(
        { id: 'p1' },
        { githubRepoUrl: 'https://github.com/user/my-app', githubRepoName: 'my-app' },
      );
      // 세션 삭제 확인
      expect(mockSessionService.deleteSession).toHaveBeenCalledWith('sid-1');
    });
  });
});
