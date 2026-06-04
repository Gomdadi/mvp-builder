import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from '../entities/project.entity';
import { AnalysisDocument } from '../entities/analysis-document.entity';
import { PipelineRun } from '../entities/pipeline-run.entity';
import { Task } from '../entities/task.entity';
import { S3Service } from '../s3/s3.service';
import { ProjectStatus } from '../entities/enums';

// Repository / S3Service mock — describe 바깥에 선언해 모든 테스트에서 공유
const mockProjectRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};
const mockAnalysisDocumentRepo = { findOne: jest.fn() };
const mockPipelineRunRepo = { findOne: jest.fn() };
const mockTaskRepo = { find: jest.fn() };
const mockS3Service = {
  listGeneratedFiles: jest.fn(),
  downloadGeneratedFile: jest.fn(),
};

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    // 각 테스트 전에 mock 리턴값/호출 기록 초기화
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        // @InjectRepository는 내부적으로 getRepositoryToken을 사용하므로 토큰으로 provide
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
        { provide: getRepositoryToken(AnalysisDocument), useValue: mockAnalysisDocumentRepo },
        { provide: getRepositoryToken(PipelineRun), useValue: mockPipelineRunRepo },
        { provide: getRepositoryToken(Task), useValue: mockTaskRepo },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('createProject', () => {
    it('프로젝트를 생성하고 식별 필드를 반환한다', async () => {
      const dto = {
        name: '내 프로젝트',
        requirements: '회원가입 기능 필요합니다',
        techStack: { backend: 'nestjs' },
      };
      const created = { ...dto };
      const saved = {
        id: 'proj-1',
        name: '내 프로젝트',
        status: ProjectStatus.CREATED,
        createdAt: new Date('2026-01-01'),
      };
      // create()는 동기 → mockReturnValue, save()는 비동기 → mockResolvedValue
      mockProjectRepo.create.mockReturnValue(created);
      mockProjectRepo.save.mockResolvedValue(saved);

      const result = await service.createProject(dto);

      expect(mockProjectRepo.create).toHaveBeenCalledWith(dto);
      expect(mockProjectRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual({
        id: 'proj-1',
        name: '내 프로젝트',
        status: ProjectStatus.CREATED,
        createdAt: saved.createdAt,
      });
    });
  });

  describe('getProject', () => {
    it('존재하는 프로젝트를 조회한다', async () => {
      const project = {
        id: 'proj-1',
        name: '내 프로젝트',
        requirements: '요구사항',
        techStack: { backend: 'nestjs' },
        status: ProjectStatus.CREATED,
        createdAt: new Date('2026-01-01'),
      };
      mockProjectRepo.findOne.mockResolvedValue(project);

      const result = await service.getProject('proj-1');

      expect(mockProjectRepo.findOne).toHaveBeenCalledWith({ where: { id: 'proj-1' } });
      expect(result.id).toBe('proj-1');
    });

    it('존재하지 않는 id면 NotFoundException을 던진다', async () => {
      mockProjectRepo.findOne.mockResolvedValue(null);
      await expect(service.getProject('none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAnalysisDocument', () => {
    it('존재하는 분석 문서를 조회한다', async () => {
      const doc = {
        id: 'doc-1',
        projectId: 'proj-1',
        version: 1,
        erd: 'erd',
        apiSpec: 'spec',
        architecture: 'arch',
        isConfirmed: false,
        createdAt: new Date('2026-01-01'),
      };
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(doc);

      const result = await service.getAnalysisDocument('doc-1');

      expect(result.id).toBe('doc-1');
      expect(result.projectId).toBe('proj-1');
    });

    it('존재하지 않는 id면 NotFoundException을 던진다', async () => {
      mockAnalysisDocumentRepo.findOne.mockResolvedValue(null);
      await expect(service.getAnalysisDocument('none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPipelineRunTasks', () => {
    it('존재하는 파이프라인 실행의 태스크를 orderIndex 순으로 조회한다', async () => {
      mockPipelineRunRepo.findOne.mockResolvedValue({ id: 'run-1' });
      const tasks = [{ id: 't1', orderIndex: 1 }];
      mockTaskRepo.find.mockResolvedValue(tasks);

      const result = await service.getPipelineRunTasks('run-1');

      expect(mockTaskRepo.find).toHaveBeenCalledWith({
        where: { pipelineRunId: 'run-1' },
        order: { orderIndex: 'ASC' },
        select: ['id', 'name', 'type', 'orderIndex', 'status'],
      });
      expect(result).toBe(tasks);
    });

    it('존재하지 않는 pipelineRunId면 NotFoundException을 던진다', async () => {
      mockPipelineRunRepo.findOne.mockResolvedValue(null);
      await expect(service.getPipelineRunTasks('none')).rejects.toThrow(NotFoundException);
      // 실행이 없으면 태스크 조회를 시도하지 않아야 한다
      expect(mockTaskRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('getProjectFileTree', () => {
    it('S3 경로 목록을 트리로 변환해 반환한다', async () => {
      mockProjectRepo.findOne.mockResolvedValue({ id: 'proj-1' });
      mockS3Service.listGeneratedFiles.mockResolvedValue([
        'src/main.ts',
        'src/app/app.module.ts',
        'package.json',
      ]);

      const result = await service.getProjectFileTree('proj-1');

      expect(mockS3Service.listGeneratedFiles).toHaveBeenCalledWith('proj-1');
      // src 디렉토리는 main.ts와 app 두 자식을 공유해야 한다
      const src = result.find((n) => n.name === 'src');
      expect(src?.children?.map((c) => c.name).sort()).toEqual(['app', 'main.ts']);
      // package.json은 children이 없는 파일 노드
      const pkg = result.find((n) => n.name === 'package.json');
      expect(pkg?.children).toBeUndefined();
      expect(pkg?.path).toBe('package.json');
    });

    it('존재하지 않는 프로젝트면 NotFoundException을 던진다', async () => {
      mockProjectRepo.findOne.mockResolvedValue(null);
      await expect(service.getProjectFileTree('none')).rejects.toThrow(NotFoundException);
      expect(mockS3Service.listGeneratedFiles).not.toHaveBeenCalled();
    });

    it('단일 파일 경로를 트리로 변환한다', async () => {
      mockProjectRepo.findOne.mockResolvedValue({ id: 'proj-1' });
      mockS3Service.listGeneratedFiles.mockResolvedValue(['README.md']);

      const result = await service.getProjectFileTree('proj-1');

      expect(result).toEqual([{ name: 'README.md', path: 'README.md' }]);
    });

    it('중첩 경로의 path가 누적되어 설정된다', async () => {
      mockProjectRepo.findOne.mockResolvedValue({ id: 'proj-1' });
      mockS3Service.listGeneratedFiles.mockResolvedValue(['src/app/app.module.ts']);

      const result = await service.getProjectFileTree('proj-1');

      const app = result[0].children![0];
      expect(app.path).toBe('src/app');
      expect(app.children![0].path).toBe('src/app/app.module.ts');
    });
  });

  describe('getProjectFile', () => {
    it('파일 내용을 다운로드해 반환한다', async () => {
      mockProjectRepo.findOne.mockResolvedValue({ id: 'proj-1' });
      mockS3Service.downloadGeneratedFile.mockResolvedValue('console.log("hi")');

      const result = await service.getProjectFile('proj-1', 'src/main.ts');

      expect(mockS3Service.downloadGeneratedFile).toHaveBeenCalledWith('proj-1', 'src/main.ts');
      expect(result).toEqual({ path: 'src/main.ts', content: 'console.log("hi")' });
    });

    it('존재하지 않는 프로젝트면 NotFoundException을 던진다', async () => {
      mockProjectRepo.findOne.mockResolvedValue(null);
      await expect(service.getProjectFile('none', 'src/main.ts')).rejects.toThrow(NotFoundException);
      expect(mockS3Service.downloadGeneratedFile).not.toHaveBeenCalled();
    });
  });
});
