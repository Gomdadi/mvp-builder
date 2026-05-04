import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAgentService } from './claude-agent.service';

// jest.mock(): 특정 모듈 전체를 가짜로 교체.
// 이 파일 안에서 '@anthropic-ai/sdk'를 import하면 실제 SDK 대신 jest가 만든 mock이 반환됨.
// 실제 API 호출 없이 테스트 가능 — 네트워크, API Key 불필요
jest.mock('@anthropic-ai/sdk');

// jest.MockedClass<T>: T 클래스의 생성자와 메서드 전부를 jest.fn()으로 바꾼 타입.
// MockedAnthropic.mockImplementation()으로 new Anthropic() 호출 시 반환값을 지정할 수 있음
const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

describe('ClaudeAgentService', () => {
  let service: ClaudeAgentService;

  // beforeEach마다 새로 생성 — 테스트 간 호출 기록이 오염되지 않도록
  let mockCreate: jest.Mock;
  let mockStream: jest.Mock;

  // ConfigService mock — 실제 .env 파일 없이 테스트 가능하도록
  // getOrThrow: CLAUDE_API_KEY 요청 시 'test-api-key' 반환
  // get: 나머지 설정값(timeout, maxRetries 등)은 fallback 기본값 그대로 반환
  const mockConfig = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
    get: jest.fn().mockImplementation((key: string, fallback: unknown) => fallback),
  };

  beforeEach(async () => {
    // 각 테스트 시작 전 모든 mock의 호출 기록 초기화.
    // 없으면 이전 테스트에서 mockCreate가 몇 번 호출됐는지가 다음 테스트에 영향을 줌
    jest.clearAllMocks();

    mockCreate = jest.fn();
    mockStream = jest.fn();

    // new Anthropic() 호출 시 실제 SDK 인스턴스 대신 아래 객체를 반환하도록 설정.
    // messages.create, messages.stream만 필요하므로 나머지 메서드는 생략 (as unknown as Anthropic으로 캐스팅)
    MockedAnthropic.mockImplementation(
      () =>
        ({
          messages: { create: mockCreate, stream: mockStream },
        }) as unknown as Anthropic,
    );

    // NestJS 테스트 모듈: 실제 앱 대신 테스트용 DI 컨테이너 생성.
    // ConfigService 자리에 mockConfig를 주입 — ClaudeAgentService 생성자가 mockConfig를 받게 됨
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeAgentService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ClaudeAgentService>(ClaudeAgentService);
  });

  describe('runWithTool', () => {
    // 정상 케이스: Claude가 tool_use 블록을 포함한 응답을 반환할 때
    it('tool_use 블록이 있으면 toolName과 toolInput을 반환한다', async () => {
      const fakeInput = { erd: '## ERD', api_spec: '## API' };

      // mockCreate: messages.create()가 호출됐을 때 반환할 가짜 응답 지정.
      // 실제 Claude API 응답 형식 그대로 — content 배열에 tool_use 블록 포함
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', name: 'generate_analysis', input: fakeInput }],
        stop_reason: 'tool_use', // Claude가 툴을 호출했을 때의 stop_reason
      });

      const result = await service.runWithTool({
        messages: [{ role: 'user', content: 'analyze' }],
        tools: [{ name: 'generate_analysis', description: 'test', input_schema: { type: 'object' } }],
      });

      // tool_use 블록에서 name과 input을 올바르게 추출했는지 검증
      expect(result.toolName).toBe('generate_analysis');
      expect(result.toolInput).toEqual(fakeInput);
    });

    // 실패 케이스 1: tool_use 없이 텍스트로만 응답한 경우
    // tools + tool_choice를 지정했는데도 Claude가 텍스트로 답하면 파싱 불가 → 에러
    it('tool_use 블록이 없으면 에러를 던진다', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'plain response' }],
        stop_reason: 'end_turn', // 툴 호출 없이 자연 종료
      });

      // rejects.toThrow: Promise가 reject될 때 특정 메시지를 포함한 에러를 던지는지 검증
      await expect(
        service.runWithTool({
          messages: [{ role: 'user', content: 'hello' }],
          tools: [{ name: 'some_tool', description: 'test', input_schema: { type: 'object' } }],
        }),
      ).rejects.toThrow('Claude did not return a tool_use block');
    });

    // 실패 케이스 2: Anthropic API 자체가 실패한 경우 (네트워크 오류, 잘못된 API Key 등)
    // ClaudeAgentService가 에러를 삼키지 않고 그대로 위로 전파하는지 검증
    it('Claude API 호출 실패 시 에러를 전파한다', async () => {
      // mockRejectedValue: Promise.reject(error)를 반환하도록 설정 — API 호출 실패 시뮬레이션
      mockCreate.mockRejectedValue(new Error('API_KEY_INVALID'));

      await expect(
        service.runWithTool({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('API_KEY_INVALID');
    });
  });

  describe('stream', () => {
    // stream()이 Anthropic SDK의 이벤트를 순서 그대로 yield하는지 검증
    it('stream 이벤트를 AsyncGenerator로 순서대로 yield한다', async () => {
      const events = [
        { type: 'message_start' },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
        { type: 'message_stop' },
      ];

      // client.messages.stream()이 AsyncIterable을 반환하도록 mock.
      // async function*: 실제 스트리밍처럼 이벤트를 하나씩 yield하는 가짜 generator
      async function* fakeStream() {
        for (const e of events) yield e;
      }
      // mockReturnValue: stream()을 호출하면 fakeStream()의 반환값(AsyncGenerator)을 반환
      mockStream.mockReturnValue(fakeStream());

      // service.stream()을 for await로 소비해 받은 이벤트를 배열에 수집
      const received: unknown[] = [];
      for await (const event of service.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
        received.push(event);
      }

      // 이벤트가 누락되거나 순서가 바뀌지 않았는지 검증
      expect(received).toHaveLength(3);
      expect(received[0]).toEqual({ type: 'message_start' });
      expect(received[1]).toEqual({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } });
      expect(received[2]).toEqual({ type: 'message_stop' });
    });
  });
});
