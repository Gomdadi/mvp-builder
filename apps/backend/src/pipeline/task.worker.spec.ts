import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { TaskWorker } from './task.worker';
import { Phase3Service } from '../claude/phase3.service';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { PipelineStatus, TaskStatus } from '../entities/enums';
import { PIPELINE_QUEUE, PipelineJobName } from './pipeline.constants';
import { SessionService } from '../session/session.service';
import { SseService } from '../sse/sse.service';

const mockPhase3Service = { run: jest.fn() };
// 기본 getSession → null (세션 없음, env 키 fallback)
const mockSessionService = { getSession: jest.fn().mockResolvedValue(null) };
// SseService mock — task_started/task_completed publish 호출 흡수
const mockSseService = { publish: jest.fn().mockResolvedValue(undefined), complete: jest.fn().mockResolvedValue(undefined) };
const mockPipelineQueue = { add: jest.fn() };
const mockPipelineRunRepo = { update: jest.fn() };
const mockTaskRepo = { count: jest.fn() };

const makeJob = (data: object) => ({ name: 'task.run', data });

describe('TaskWorker', () => {
  let worker: TaskWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessionService.getSession.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        TaskWorker,
        { provide: Phase3Service, useValue: mockPhase3Service },
        { provide: SessionService, useValue: mockSessionService },
        { provide: SseService, useValue: mockSseService },
        { provide: getQueueToken(PIPELINE_QUEUE), useValue: mockPipelineQueue },
        { provide: getRepositoryToken(PipelineRun), useValue: mockPipelineRunRepo },
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
      ],
    }).compile();
    worker = module.get(TaskWorker);
  });

  const jobData = { projectId: 'p1', pipelineRunId: 'run-1', taskId: 't1' };

  describe('handleRun', () => {
    it('Phase3Service.run 호출 후 완료 판정을 수행한다', async () => {
      mockPhase3Service.run.mockResolvedValue(undefined);
      mockTaskRepo.count
        .mockResolvedValueOnce(2)  // total
        .mockResolvedValueOnce(1); // doneOrFailed < total → 아직 미완료

      await worker.process(makeJob(jobData) as any);

      // sessionId 없으므로 claudeApiKey는 undefined (env 키 fallback)
      expect(mockPhase3Service.run).toHaveBeenCalledWith('p1', 't1', undefined);
      expect(mockPipelineRunRepo.update).not.toHaveBeenCalled();
    });

    it('모든 Task가 DONE이면 PIPELINE_QUEUE에 SANDBOX 잡을 enqueue한다', async () => {
      mockPhase3Service.run.mockResolvedValue(undefined);
      mockTaskRepo.count
        .mockResolvedValueOnce(2)  // total
        .mockResolvedValueOnce(2)  // doneOrFailed === total
        .mockResolvedValueOnce(0); // failedCount
      mockPipelineQueue.add.mockResolvedValue(undefined);

      await worker.process(makeJob(jobData) as any);

      // sessionId가 undefined일 때도 포함되어야 함
      expect(mockPipelineQueue.add).toHaveBeenCalledWith(
        PipelineJobName.SANDBOX,
        { projectId: 'p1', pipelineRunId: 'run-1', sessionId: undefined },
      );
      expect(mockPipelineRunRepo.update).not.toHaveBeenCalled();
    });

    it('FAILED Task가 있으면 PipelineRun을 FAILED로 갱신한다', async () => {
      mockPhase3Service.run.mockResolvedValue(undefined);
      mockTaskRepo.count
        .mockResolvedValueOnce(2)  // total
        .mockResolvedValueOnce(2)  // doneOrFailed === total
        .mockResolvedValueOnce(1); // failedCount > 0

      await worker.process(makeJob(jobData) as any);

      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.FAILED }),
      );
    });

    it('Phase3Service.run 실패해도 완료 판정은 수행하고 예외를 re-throw한다', async () => {
      mockPhase3Service.run.mockRejectedValue(new Error('phase3 error'));
      mockTaskRepo.count
        .mockResolvedValueOnce(1)  // total
        .mockResolvedValueOnce(1)  // doneOrFailed === total
        .mockResolvedValueOnce(1); // failedCount

      await expect(worker.process(makeJob(jobData) as any)).rejects.toThrow('phase3 error');
      // finally 블록이 실행되어 PipelineRun이 FAILED로 갱신됨
      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.FAILED }),
      );
    });
  });
});
