import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PipelineService } from './pipeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { PIPELINE_QUEUE, PipelineJobName } from './pipeline.constants';

// jest.fn(): 실제 구현 없이 호출 여부, 인자 등을 추적할 수 있는 가짜 함수
const mockQueue = { add: jest.fn() };
const mockPrisma = {
  project: { findUnique: jest.fn() },
  pipelineRun: { findFirst: jest.fn(), create: jest.fn() },
};

// describe: 테스트 그룹. 관련된 테스트를 묶는 용도
describe('PipelineService', () => {
  let service: PipelineService;

  // 각 테스트(it) 실행 전에 자동으로 실행. mock 초기화 + 테스트 모듈 재생성.
  beforeEach(async () => {
    // 이전 테스트에서 mock이 호출된 기록을 초기화. 없으면 테스트 간 결과가 오염됨
    jest.clearAllMocks();

    // 실제 NestJS 앱 대신 테스트용 모듈을 생성
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineService,
        // getQueueToken: @InjectQueue가 내부적으로 쓰는 "BullQueue_pipeline" 토큰을 반환.
        // 같은 Queue 타입이 여러 개일 수 있어서 클래스 대신 이름 기반 토큰으로 식별한다.
        { provide: getQueueToken(PIPELINE_QUEUE), useValue: mockQueue },
        // provide: 어떤 토큰(키)으로 등록할지 / useValue: 실제 대신 쓸 mock 값
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile(); // 설정을 바탕으로 DI 컨테이너 구성 + 인스턴스 생성

    // 컴파일된 모듈에서 테스트할 서비스 인스턴스를 꺼냄
    service = module.get<PipelineService>(PipelineService);
  });

  describe('start', () => {
    it('잡을 등록하고 pipelineRun 정보를 반환한다', async () => {
      // mockResolvedValue: 비동기 함수가 반환할 값을 지정. Promise.resolve(값)과 동일
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-id' });
      mockPrisma.pipelineRun.findFirst.mockResolvedValue(null);
      mockPrisma.pipelineRun.create.mockResolvedValue({
        id: 'run-id',
        phase: 'PHASE_1',
        status: 'RUNNING',
      });

      const result = await service.start('project-id');

      // toHaveBeenCalledWith: mock 함수가 특정 인자로 호출됐는지 검증
      expect(mockPrisma.pipelineRun.create).toHaveBeenCalledWith({
        data: { projectId: 'project-id', phase: 'PHASE_1', status: 'RUNNING' },
      });
      // expect.objectContaining: 객체의 일부 필드만 검증 (나머지 필드는 무시)
      expect(mockQueue.add).toHaveBeenCalledWith(
        PipelineJobName.START,
        expect.objectContaining({ projectId: 'project-id', phase: 'PHASE_1' }),
      );
      expect(result).toEqual({ pipelineId: 'run-id', phase: 'PHASE_1', status: 'RUNNING' });
    });

    it('존재하지 않는 projectId면 404를 던진다', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      // rejects.toThrow: Promise가 reject될 때 특정 예외를 던지는지 검증
      await expect(service.start('not-exist')).rejects.toThrow(NotFoundException);
      // not.toHaveBeenCalled: mock 함수가 한 번도 호출되지 않았는지 검증
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('이미 실행 중인 파이프라인이 있으면 409를 던진다', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-id' });
      mockPrisma.pipelineRun.findFirst.mockResolvedValue({ id: 'existing-run' });

      await expect(service.start('project-id')).rejects.toThrow(ConflictException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
