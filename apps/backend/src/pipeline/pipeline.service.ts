import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { PipelinePhase, PipelineStatus } from '../entities/enums';
import { PIPELINE_QUEUE, PipelineJobName } from './pipeline.constants';

@Injectable()
export class PipelineService {
  constructor(
    // @InjectQueue: Queue 타입이 여러 개일 수 있어서 이름 기반 토큰으로 어떤 큐를 주입할지 명시
    @InjectQueue(PIPELINE_QUEUE) private readonly pipelineQueue: Queue,
    // @InjectRepository: TypeOrmModule.forFeature()에 등록된 엔티티의 Repository를 주입
    // Repository<T>: TypeORM의 기본 저장소 클래스. findOne, save, update 등 CRUD 메서드 제공
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(PipelineRun) private readonly pipelineRunRepo: Repository<PipelineRun>,
    @InjectRepository(AnalysisDocument) private readonly analysisDocumentRepo: Repository<AnalysisDocument>,
  ) {}

  async start(projectId: string) {
    // findOne: 조건에 맞는 단건 조회. 없으면 null 반환 (Prisma의 findUnique와 동일)
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      // NotFoundException: NestJS가 자동으로 404 응답으로 변환
      throw new NotFoundException('NOT_FOUND');
    }

    const running = await this.pipelineRunRepo.findOne({
      where: { projectId, status: PipelineStatus.RUNNING },
    });
    if (running) {
      // ConflictException: NestJS가 자동으로 409 응답으로 변환
      throw new ConflictException('PIPELINE_ALREADY_RUNNING');
    }

    // create(): 엔티티 인스턴스만 생성 (DB 저장 안 함)
    // save(): 생성된 인스턴스를 DB에 INSERT하고 저장된 엔티티(자동 생성 필드 포함)를 반환
    const pipelineRun = await this.pipelineRunRepo.save(
      this.pipelineRunRepo.create({
        projectId,
        phase: PipelinePhase.PHASE_1,
        status: PipelineStatus.RUNNING,
      }),
    );

    // 큐에 잡 등록. Worker가 Redis에서 꺼내서 비동기로 처리
    // 잡 등록 후 바로 return — Worker 실행을 기다리지 않음
    await this.pipelineQueue.add(PipelineJobName.START, {
      projectId,
      pipelineRunId: pipelineRun.id,
      phase: PipelinePhase.PHASE_1,
    });

    return { pipelineId: pipelineRun.id, phase: pipelineRun.phase, status: pipelineRun.status };
  }

  // 분석 문서 확정 → Phase 2/3 실행 잡 등록.
  // analysisDocumentId: 사용자가 확정할 분석 문서 (여러 버전 중 하나를 선택 가능)
  async confirm(projectId: string, analysisDocumentId: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('NOT_FOUND');
    }

    const running = await this.pipelineRunRepo.findOne({
      where: { projectId, status: PipelineStatus.RUNNING },
    });
    if (running) {
      throw new ConflictException('PIPELINE_ALREADY_RUNNING');
    }

    // isConfirmed=true로 변경 — Phase 2/3에서 이 문서를 기준으로 코드를 생성
    await this.analysisDocumentRepo.update({ id: analysisDocumentId }, { isConfirmed: true });

    const pipelineRun = await this.pipelineRunRepo.save(
      this.pipelineRunRepo.create({
        projectId,
        phase: PipelinePhase.PHASE_2,
        status: PipelineStatus.RUNNING,
      }),
    );

    await this.pipelineQueue.add(PipelineJobName.CONFIRM, {
      projectId,
      pipelineRunId: pipelineRun.id,
    });

    return { pipelineId: pipelineRun.id, phase: pipelineRun.phase, status: pipelineRun.status };
  }

  // 피드백 제출 → Phase 1 재실행 잡 등록.
  // feedbackText: 이전 분석 문서에 대한 수정 요청 — Phase1Service.run()에 전달됨
  async feedback(projectId: string, analysisDocumentId: string, feedbackText: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('NOT_FOUND');
    }

    const running = await this.pipelineRunRepo.findOne({
      where: { projectId, status: PipelineStatus.RUNNING },
    });
    if (running) {
      throw new ConflictException('PIPELINE_ALREADY_RUNNING');
    }

    // userFeedback 저장 — Phase 1 재실행 시 이 피드백을 시스템 메시지에 포함
    await this.analysisDocumentRepo.update({ id: analysisDocumentId }, { userFeedback: feedbackText });

    const pipelineRun = await this.pipelineRunRepo.save(
      this.pipelineRunRepo.create({
        projectId,
        phase: PipelinePhase.PHASE_1,
        status: PipelineStatus.RUNNING,
      }),
    );

    await this.pipelineQueue.add(PipelineJobName.FEEDBACK, {
      projectId,
      pipelineRunId: pipelineRun.id,
      feedbackText,
    });

    return { pipelineId: pipelineRun.id, phase: pipelineRun.phase, status: pipelineRun.status };
  }
}
