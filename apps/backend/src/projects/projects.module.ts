import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from '../entities/project.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    // TypeOrmModule.forFeature: ProjectsService가 @InjectRepository로 주입받을 엔티티 등록
    TypeOrmModule.forFeature([Project, AnalysisDocument, PipelineRun, Task]),
    // S3Module: 생성 파일 조회/다운로드를 위한 S3Service 제공 (exports되어 있음)
    S3Module,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
