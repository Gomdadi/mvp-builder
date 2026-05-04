import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PipelinePhase, PipelineStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PIPELINE_QUEUE, PipelineJobName } from './pipeline.constants';

@Injectable()
export class PipelineService {
  constructor(
    // @InjectQueue: Queue 타입이 여러 개일 수 있어서 이름 기반 토큰으로 어떤 큐를 주입할지 명시
    @InjectQueue(PIPELINE_QUEUE) private readonly pipelineQueue: Queue,
    // PrismaService는 타입이 유일해서 @InjectQueue 없이 타입만으로 주입
    private readonly prisma: PrismaService,
  ) {}

  async start(projectId: string) {
    // findUnique: PK 또는 unique 필드로 단건 조회. 없으면 null 반환
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      // NotFoundException: NestJS가 자동으로 404 응답으로 변환
      throw new NotFoundException('NOT_FOUND');
    }

    // findFirst: 조건에 맞는 첫 번째 행 조회. 없으면 null 반환
    const running = await this.prisma.pipelineRun.findFirst({
      where: { projectId, status: PipelineStatus.RUNNING },
    });
    if (running) {
      // ConflictException: NestJS가 자동으로 409 응답으로 변환
      throw new ConflictException('PIPELINE_ALREADY_RUNNING');
    }

    const pipelineRun = await this.prisma.pipelineRun.create({
      data: { projectId, phase: PipelinePhase.PHASE_1, status: PipelineStatus.RUNNING },
    });

    // 큐에 잡 등록. Worker가 Redis에서 꺼내서 비동기로 처리
    // 잡 등록 후 바로 return — Worker 실행을 기다리지 않음
    await this.pipelineQueue.add(PipelineJobName.START, {
      projectId,
      pipelineRunId: pipelineRun.id,
      phase: PipelinePhase.PHASE_1,
    });

    return { pipelineId: pipelineRun.id, phase: pipelineRun.phase, status: pipelineRun.status };
  }
}
