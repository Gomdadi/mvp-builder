import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { PipelineWorker } from './pipeline.worker';
import { TASK_QUEUE, PipelineJobName, TaskJobName } from './pipeline.constants';
import { Phase1Service } from '../claude/phase1.service';
import { Phase2Service } from '../claude/phase2.service';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { PipelinePhase, PipelineStatus, TaskStatus } from '../entities/enums';

const mockPhase1Service = { run: jest.fn() };
const mockPhase2Service = { run: jest.fn() };
const mockTaskQueue = { add: jest.fn() };
const mockPipelineRunRepo = { update: jest.fn() };
const mockTaskRepo = { count: jest.fn(), find: jest.fn() };

const makeJob = (name: string, data: object) => ({ name, data });

describe('PipelineWorker', () => {
  let worker: PipelineWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PipelineWorker,
        { provide: Phase1Service, useValue: mockPhase1Service },
        { provide: Phase2Service, useValue: mockPhase2Service },
        { provide: getQueueToken(TASK_QUEUE), useValue: mockTaskQueue },
        { provide: getRepositoryToken(PipelineRun), useValue: mockPipelineRunRepo },
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
      ],
    }).compile();
    worker = module.get(PipelineWorker);
  });

  describe('handleStart', () => {
    const job = makeJob(PipelineJobName.START, { projectId: 'p1', pipelineRunId: 'run-1' });

    it('Phase1Service.run 호출 후 PipelineRun을 COMPLETED로 갱신한다', async () => {
      mockPhase1Service.run.mockResolvedValue('doc-id');

      await worker.process(job as any);

      expect(mockPhase1Service.run).toHaveBeenCalledWith('p1');
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.COMPLETED }),
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
      mockPhase1Service.run.mockResolvedValue('doc-id');

      await worker.process(job as any);

      expect(mockPhase1Service.run).toHaveBeenCalledWith('p1', 'ERD 수정 필요');
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.COMPLETED }),
      );
    });
  });

  describe('handleConfirm', () => {
    const job = makeJob(PipelineJobName.CONFIRM, { projectId: 'p1', pipelineRunId: 'run-1' });
    const fakeTasks = [
      { id: 't1', status: TaskStatus.PENDING },
      { id: 't2', status: TaskStatus.FAILED },
    ];

    it('Tasks가 없으면 Phase2를 실행하고 Task들을 큐에 enqueue한다', async () => {
      mockTaskRepo.count.mockResolvedValueOnce(0); // existingCount
      mockPhase2Service.run.mockResolvedValue(undefined);
      mockTaskRepo.find.mockResolvedValue(fakeTasks);
      mockTaskQueue.add.mockResolvedValue(undefined);

      await worker.process(job as any);

      expect(mockPhase2Service.run).toHaveBeenCalledWith('p1', 'run-1');
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        { phase: PipelinePhase.PHASE_3 },
      );
      expect(mockTaskQueue.add).toHaveBeenCalledTimes(2);
      expect(mockTaskQueue.add).toHaveBeenCalledWith(
        TaskJobName.RUN,
        expect.objectContaining({ taskId: 't1' }),
        { jobId: 't1' },
      );
    });

    it('Tasks가 이미 있으면 Phase2를 skip하고 DONE 제외 Tasks만 enqueue한다', async () => {
      mockTaskRepo.count.mockResolvedValueOnce(3); // existingCount > 0 → Phase 2 skip
      // DONE 태스크 포함 목록 (find where Not(DONE))
      const nonDoneTasks = [{ id: 't2', status: TaskStatus.PENDING }];
      mockTaskRepo.find.mockResolvedValue(nonDoneTasks);

      await worker.process(job as any);

      expect(mockPhase2Service.run).not.toHaveBeenCalled();
      expect(mockTaskQueue.add).toHaveBeenCalledTimes(1);
      expect(mockTaskQueue.add).toHaveBeenCalledWith(
        TaskJobName.RUN,
        expect.objectContaining({ taskId: 't2' }),
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
});
