import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

// ProjectsService mock — Controller가 서비스에 올바르게 위임하는지만 검증
const mockProjectsService = {
  createProject: jest.fn(),
  getProject: jest.fn(),
  getAnalysisDocument: jest.fn(),
  getPipelineRunTasks: jest.fn(),
  getProjectFileTree: jest.fn(),
  getProjectFile: jest.fn(),
};

describe('ProjectsController', () => {
  let controller: ProjectsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: mockProjectsService }],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('POST /projects — createProject에 dto를 위임한다', () => {
    const dto = { name: 'p', requirements: '요구사항입니다 길게', techStack: {} };
    const expected = { id: 'proj-1' };
    mockProjectsService.createProject.mockReturnValue(expected);

    const result = controller.createProject(dto);

    expect(mockProjectsService.createProject).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('GET /projects/:id — getProject에 id를 위임한다', () => {
    const expected = { id: 'proj-1' };
    mockProjectsService.getProject.mockReturnValue(expected);

    const result = controller.getProject('proj-1');

    expect(mockProjectsService.getProject).toHaveBeenCalledWith('proj-1');
    expect(result).toBe(expected);
  });

  it('GET /analysis-documents/:id — getAnalysisDocument에 id를 위임한다', () => {
    const expected = { id: 'doc-1' };
    mockProjectsService.getAnalysisDocument.mockReturnValue(expected);

    const result = controller.getAnalysisDocument('doc-1');

    expect(mockProjectsService.getAnalysisDocument).toHaveBeenCalledWith('doc-1');
    expect(result).toBe(expected);
  });

  it('GET /pipeline-runs/:id/tasks — getPipelineRunTasks에 id를 위임한다', () => {
    const expected = [{ id: 't1' }];
    mockProjectsService.getPipelineRunTasks.mockReturnValue(expected);

    const result = controller.getPipelineRunTasks('run-1');

    expect(mockProjectsService.getPipelineRunTasks).toHaveBeenCalledWith('run-1');
    expect(result).toBe(expected);
  });

  it('GET /projects/:id/files (path 없음) — getProjectFileTree에 위임한다', () => {
    const expected = [{ name: 'src', path: 'src' }];
    mockProjectsService.getProjectFileTree.mockReturnValue(expected);

    const result = controller.getProjectFiles('proj-1', undefined);

    expect(mockProjectsService.getProjectFileTree).toHaveBeenCalledWith('proj-1');
    expect(mockProjectsService.getProjectFile).not.toHaveBeenCalled();
    expect(result).toBe(expected);
  });

  it('GET /projects/:id/files?path=... — getProjectFile에 위임한다', () => {
    const expected = { path: 'src/main.ts', content: 'code' };
    mockProjectsService.getProjectFile.mockReturnValue(expected);

    const result = controller.getProjectFiles('proj-1', 'src/main.ts');

    expect(mockProjectsService.getProjectFile).toHaveBeenCalledWith('proj-1', 'src/main.ts');
    expect(mockProjectsService.getProjectFileTree).not.toHaveBeenCalled();
    expect(result).toBe(expected);
  });
});
