import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { S3Service } from '../s3/s3.service';
import { CreateProjectDto } from './dto/create-project.dto';

// 파일 트리 노드. S3 경로 배열을 재귀 트리 구조로 변환할 때 사용.
// children이 있으면 디렉토리, 없으면 파일을 의미.
// export: controller의 추론 반환 타입이 이 이름을 참조하므로 외부에서 명명 가능해야 한다(TS4053)
export interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
}

// 프로젝트 및 파이프라인 산출물(분석 문서, 태스크, 생성 파일) 조회를 담당하는 서비스.
// 세션 기반(no-auth) 구조라 클라이언트가 보관한 id로만 조회한다.
@Injectable()
export class ProjectsService {
  constructor(
    // @InjectRepository: TypeOrmModule.forFeature()에 등록된 엔티티의 Repository를 주입
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(AnalysisDocument) private readonly analysisDocumentRepo: Repository<AnalysisDocument>,
    @InjectRepository(PipelineRun) private readonly pipelineRunRepo: Repository<PipelineRun>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    // S3Service: 생성 파일 목록 조회/다운로드. S3Module이 exports하는 것을 주입
    private readonly s3Service: S3Service,
  ) {}

  // 프로젝트 생성 — DTO를 그대로 저장 후 식별 필드만 반환
  async createProject(dto: CreateProjectDto) {
    // create(): 인스턴스 생성(DB 저장 안 함), save(): INSERT 후 자동 생성 필드 포함 엔티티 반환
    const project = await this.projectRepo.save(this.projectRepo.create(dto));
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt,
    };
  }

  // 프로젝트 단건 조회 — 없으면 404
  async getProject(id: string) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException('PROJECT_NOT_FOUND');
    }
    return {
      id: project.id,
      name: project.name,
      requirements: project.requirements,
      techStack: project.techStack,
      status: project.status,
      createdAt: project.createdAt,
    };
  }

  // 분석 문서 단건 조회 — Phase 1 산출물. 없으면 404
  async getAnalysisDocument(id: string) {
    const doc = await this.analysisDocumentRepo.findOne({ where: { id } });
    if (!doc) {
      throw new NotFoundException('ANALYSIS_DOCUMENT_NOT_FOUND');
    }
    return {
      id: doc.id,
      projectId: doc.projectId,
      version: doc.version,
      erd: doc.erd,
      apiSpec: doc.apiSpec,
      architecture: doc.architecture,
      isConfirmed: doc.isConfirmed,
      createdAt: doc.createdAt,
    };
  }

  // 특정 파이프라인 실행의 태스크 목록 조회 — orderIndex 오름차순(실행 순서). 실행이 없으면 404
  async getPipelineRunTasks(pipelineRunId: string) {
    const pipelineRun = await this.pipelineRunRepo.findOne({ where: { id: pipelineRunId } });
    if (!pipelineRun) {
      throw new NotFoundException('PIPELINE_RUN_NOT_FOUND');
    }
    // select: 필요한 컬럼만 조회 — Phase 3 진행 상황 표시에 쓰이는 필드만 노출
    return this.taskRepo.find({
      where: { pipelineRunId },
      order: { orderIndex: 'ASC' },
      select: ['id', 'name', 'type', 'orderIndex', 'status'],
    });
  }

  // 프로젝트 생성 파일의 트리 구조 조회 — S3 경로 목록을 트리로 변환. 프로젝트 없으면 404
  async getProjectFileTree(projectId: string) {
    await this.ensureProjectExists(projectId);
    const paths = await this.s3Service.listGeneratedFiles(projectId);
    return this.buildTree(paths);
  }

  // 단일 생성 파일 내용 조회 — S3에서 다운로드. 프로젝트 없으면 404
  async getProjectFile(projectId: string, filePath: string) {
    await this.ensureProjectExists(projectId);
    const content = await this.s3Service.downloadGeneratedFile(projectId, filePath);
    return { path: filePath, content };
  }

  // 프로젝트 존재 확인 헬퍼 — 파일 조회 경계에서 공통으로 사용
  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('PROJECT_NOT_FOUND');
    }
  }

  // S3 경로 배열(["src/main.ts", "src/app/app.module.ts", "package.json"])을 재귀 트리로 변환.
  // 같은 디렉토리를 공유하는 경로는 동일 노드의 children에 합쳐진다.
  private buildTree(paths: string[]): FileNode[] {
    const root: FileNode[] = [];
    for (const filePath of paths) {
      const parts = filePath.split('/');
      let current = root;
      let accumulated = '';
      for (let i = 0; i < parts.length; i++) {
        // accumulated: 루트부터 현재 part까지의 누적 경로 (노드의 path 필드)
        accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
        // 같은 이름의 노드가 이미 있으면 재사용해 디렉토리를 공유
        let node = current.find((n) => n.name === parts[i]);
        if (!node) {
          node = { name: parts[i], path: accumulated };
          // 마지막 part가 아니면 디렉토리이므로 children 배열을 부여
          if (i < parts.length - 1) node.children = [];
          current.push(node);
        }
        // 디렉토리라면 다음 part를 children 하위로 내려가며 처리
        if (node.children) current = node.children;
      }
    }
    return root;
  }
}
