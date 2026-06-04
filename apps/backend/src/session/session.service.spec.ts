import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { SESSION_REDIS } from './session.constants';

// ioredis 커넥션 mock — 실제 Redis 없이 set/get/del 호출 인자와 반환값을 검증한다
const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        // SESSION_REDIS 토큰으로 mock 커넥션 주입
        { provide: SESSION_REDIS, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('createSession', () => {
    // UUID를 발급하고 TTL과 함께 SET을 호출하는지 검증
    it('세션을 JSON 직렬화해 TTL과 함께 저장하고 sessionId를 반환한다', async () => {
      const data = { githubToken: 'ghp_x', claudeApiKey: 'sk-x', isPrivate: false };

      const sessionId = await service.createSession(data);

      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      // set(key, value, 'EX', ttl) 형태로 호출되어야 함
      expect(mockRedis.set).toHaveBeenCalledWith(
        `session:${sessionId}`,
        JSON.stringify(data),
        'EX',
        86400,
      );
    });
  });

  describe('getSession', () => {
    // 저장된 JSON을 파싱해 객체로 반환
    it('키가 존재하면 파싱된 세션 데이터를 반환한다', async () => {
      const data = { githubToken: 'ghp_x', claudeApiKey: 'sk-x', isPrivate: true };
      mockRedis.get.mockResolvedValue(JSON.stringify(data));

      const result = await service.getSession('sess-1');

      expect(mockRedis.get).toHaveBeenCalledWith('session:sess-1');
      expect(result).toEqual(data);
    });

    // 키가 없으면 null 반환
    it('키가 없으면 null을 반환한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getSession('missing');

      expect(result).toBeNull();
    });

    // sessionId가 빈 문자열이면 Redis 조회 없이 null 반환 (env 키 fallback 경로)
    it('sessionId가 비어있으면 Redis 조회 없이 null을 반환한다', async () => {
      const result = await service.getSession('');

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    // DEL 호출 검증
    it('세션 키를 삭제한다', async () => {
      await service.deleteSession('sess-1');

      expect(mockRedis.del).toHaveBeenCalledWith('session:sess-1');
    });

    // sessionId가 비어있으면 DEL 미호출
    it('sessionId가 비어있으면 삭제하지 않는다', async () => {
      await service.deleteSession('');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});
