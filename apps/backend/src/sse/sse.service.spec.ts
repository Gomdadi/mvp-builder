import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { SseService } from './sse.service';
import { SSE_REDIS_PUB, SSE_REDIS_SUB } from './sse.constants';
import { SseEvent } from './sse.types';

// SUBSCRIBE 커넥션의 on('message') 핸들러를 캡처해 테스트에서 직접 메시지를 주입하기 위한 변수.
// SseService 생성자에서 sub.on('message', handler)를 호출하면 여기에 저장된다.
let messageHandler: ((channel: string, message: string) => void) | undefined;

// PUBLISH 전용 ioredis 커넥션 mock
const mockPub = {
  publish: jest.fn(),
};

// SUBSCRIBE 전용 ioredis 커넥션 mock
const mockSub = {
  // on('message', handler) 등록 시 핸들러를 캡처
  on: jest.fn((event: string, handler: (channel: string, message: string) => void) => {
    if (event === 'message') messageHandler = handler;
  }),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};

describe('SseService', () => {
  let service: SseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    messageHandler = undefined;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SseService,
        { provide: SSE_REDIS_PUB, useValue: mockPub },
        { provide: SSE_REDIS_SUB, useValue: mockSub },
      ],
    }).compile();

    service = module.get<SseService>(SseService);
  });

  describe('publish', () => {
    // Redis PUBLISH를 채널명 sse:{projectId}와 직렬화된 이벤트로 호출하는지 검증
    it('Redis pub에 PUBLISH를 호출한다', async () => {
      const event: SseEvent = { type: 'phase_started', phase: 'PHASE_1', timestamp: '2026-01-01T00:00:00.000Z' };

      await service.publish('p1', event);

      expect(mockPub.publish).toHaveBeenCalledWith('sse:p1', JSON.stringify(event));
    });
  });

  describe('getStream', () => {
    // 최초 호출 시 Subject 생성 + Redis SUBSCRIBE 호출
    it('최초 호출 시 해당 채널을 SUBSCRIBE한다', () => {
      service.getStream('p1');

      expect(mockSub.subscribe).toHaveBeenCalledWith('sse:p1');
      expect(mockSub.subscribe).toHaveBeenCalledTimes(1);
    });

    // 같은 projectId로 재호출 시 중복 SUBSCRIBE 없이 기존 Subject 재사용
    it('같은 projectId 재호출 시 중복 SUBSCRIBE하지 않는다', () => {
      service.getStream('p1');
      service.getStream('p1');

      expect(mockSub.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('complete', () => {
    // complete 시 Redis UNSUBSCRIBE 호출
    it('스트림 종료 시 해당 채널을 UNSUBSCRIBE한다', async () => {
      service.getStream('p1');

      await service.complete('p1');

      expect(mockSub.unsubscribe).toHaveBeenCalledWith('sse:p1');
    });

    // 구독한 적 없는 projectId complete 시 UNSUBSCRIBE 미호출
    it('구독하지 않은 projectId는 UNSUBSCRIBE하지 않는다', async () => {
      await service.complete('unknown');

      expect(mockSub.unsubscribe).not.toHaveBeenCalled();
    });

    // complete 후 같은 projectId getStream 시 다시 SUBSCRIBE (Subject가 삭제됐으므로)
    it('complete 후 재구독 시 다시 SUBSCRIBE한다', async () => {
      service.getStream('p1');
      await service.complete('p1');
      service.getStream('p1');

      expect(mockSub.subscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('통합: Redis 메시지 수신 → Observable 전달', () => {
    // sub.on('message') 핸들러가 메시지를 수신하면 해당 Subject로 next()되어 Observable로 흐르는지 검증
    it('SUBSCRIBE 채널 메시지 수신 시 Observable로 이벤트가 전달된다', async () => {
      const stream = service.getStream('p1');
      const event: SseEvent = { type: 'phase_completed', phase: 'PHASE_1', timestamp: '2026-01-01T00:00:00.000Z' };

      // 첫 이벤트를 기다리는 Promise를 먼저 만든 뒤, 캡처한 핸들러로 메시지를 주입
      const received = firstValueFrom(stream);
      messageHandler!('sse:p1', JSON.stringify(event));

      const result = await received;
      expect(result).toEqual({ data: event });
    });
  });
});
