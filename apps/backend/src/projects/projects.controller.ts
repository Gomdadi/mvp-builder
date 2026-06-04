import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';

// @Controller(): prefix 없음 — 엔드포인트마다 prefix가 달라(projects/analysis-documents/pipeline-runs)
// 각 핸들러 경로에 직접 명시한다. global prefix 'v1'은 main.ts의 setGlobalPrefix가 처리.
@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // POST /v1/projects — 프로젝트 생성 (201 Created)
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  createProject(@Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(dto);
  }

  // GET /v1/projects/:id — 프로젝트 단건 조회
  @Get('projects/:id')
  getProject(@Param('id') id: string) {
    return this.projectsService.getProject(id);
  }

  // GET /v1/analysis-documents/:id — Phase 1 분석 문서 조회
  @Get('analysis-documents/:id')
  getAnalysisDocument(@Param('id') id: string) {
    return this.projectsService.getAnalysisDocument(id);
  }

  // GET /v1/pipeline-runs/:id/tasks — 특정 파이프라인 실행의 태스크 목록 조회
  @Get('pipeline-runs/:id/tasks')
  getPipelineRunTasks(@Param('id') id: string) {
    return this.projectsService.getPipelineRunTasks(id);
  }

  // GET /v1/projects/:id/files — 생성 파일 조회
  // path 쿼리가 있으면 단일 파일 내용을, 없으면 전체 파일 트리를 반환
  @Get('projects/:id/files')
  getProjectFiles(@Param('id') id: string, @Query('path') filePath?: string) {
    if (filePath) return this.projectsService.getProjectFile(id, filePath);
    return this.projectsService.getProjectFileTree(id);
  }
}
