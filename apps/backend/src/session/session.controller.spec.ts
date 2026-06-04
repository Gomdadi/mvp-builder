import { Test, TestingModule } from '@nestjs/testing';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

// SessionService mock — controller가 서비스에 위임하는지만 검증한다
const mockSessionService = { createSession: jest.fn() };

describe('SessionController', () => {
  let controller: SessionController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [{ provide: SessionService, useValue: mockSessionService }],
    }).compile();

    controller = module.get<SessionController>(SessionController);
  });

  // body의 세 필드를 그대로 createSession에 전달하고, 결과 sessionId를 응답으로 반환
  it('createSession을 호출하고 sessionId를 반환한다', async () => {
    mockSessionService.createSession.mockResolvedValue('sess-1');
    const body = { githubToken: 'ghp_x', claudeApiKey: 'sk-x', isPrivate: true };

    const result = await controller.create(body);

    expect(mockSessionService.createSession).toHaveBeenCalledWith({
      githubToken: 'ghp_x',
      claudeApiKey: 'sk-x',
      isPrivate: true,
    });
    expect(result).toEqual({ sessionId: 'sess-1' });
  });
});
