import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskWorker } from './task.worker';
import { Phase3Service } from '../claude/phase3.service';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { PipelineStatus, TaskStatus } from '../entities/enums';

const mockPhase3Service = { run: jest.fn() };
const mockPipelineRunRepo = { update: jest.fn() };
const mockTaskRepo = { count: jest.fn() };

const makeJob = (data: object) => ({ name: 'task.run', data });

describe('TaskWorker', () => {
  let worker: TaskWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TaskWorker,
        { provide: Phase3Service, useValue: mockPhase3Service },
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

      expect(mockPhase3Service.run).toHaveBeenCalledWith('p1', 't1');
      expect(mockPipelineRunRepo.update).not.toHaveBeenCalled();
    });

    it('모든 Task가 DONE이면 PipelineRun을 COMPLETED로 갱신한다', async () => {
      mockPhase3Service.run.mockResolvedValue(undefined);
      mockTaskRepo.count
        .mockResolvedValueOnce(2)  // total
        .mockResolvedValueOnce(2)  // doneOrFailed === total
        .mockResolvedValueOnce(0); // failedCount

      await worker.process(makeJob(jobData) as any);

      expect(mockPipelineRunRepo.update).toHaveBeenCalledWith(
        { id: 'run-1' },
        expect.objectContaining({ status: PipelineStatus.COMPLETED }),
      );
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
