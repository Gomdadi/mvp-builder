import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

// runWithTool()의 반환 타입
export interface ToolResult {
  toolName: string;
  toolInput: unknown;
}

// runAgentLoop()의 옵션
export interface AgentLoopOptions {
  messages: Anthropic.MessageParam[];
  system?: string;
  // 에이전트가 순서대로 호출할 툴 목록
  tools: Anthropic.Tool[];
  // 각 tool_use 블록이 발생할 때 호출되는 콜백.
  // toolName: Claude가 호출한 툴 이름, toolInput: Claude가 생성한 JSON
  // 반환값: Claude에게 돌려줄 tool_result 문자열 (다음 툴 호출의 맥락이 됨)
  onToolCall: (toolName: string, toolInput: unknown) => Promise<string> | string;
  maxTokens?: number;
  // 무한 루프 방지용 최대 API 호출 횟수. 기본값 10
  maxIterations?: number;
}

// ClaudeAgentService가 받는 공통 옵션
// Anthropic Messages API 스펙: https://docs.anthropic.com/en/api/messages
export interface ClaudeCallOptions {
  // Claude에게 보낼 대화 메시지 목록.
  // 각 메시지는 { role: 'user' | 'assistant', content: string } 형태.
  // - role 'user': 사람이 보낸 메시지 (질문, 요청, 툴 실행 결과 전달 등)
  // - role 'assistant': Claude가 이전에 보낸 메시지 — 다음 요청 시 맥락 유지를 위해 포함
  // - user → assistant → user → assistant ... 순서로 번갈아야 하며, 항상 user로 시작
  // 단일 요청이면 [{ role: 'user', content: '...' }] 하나만 넣으면 됨
  messages: Anthropic.MessageParam[];
  // Claude의 역할·행동 방식을 지정하는 시스템 프롬프트. "당신은 X 전문가입니다" 같은 지시문
  system?: string;
  // Claude가 호출할 수 있는 툴 목록.
  // 각 툴은 { name, description, input_schema } 형태로 정의.
  // - name: 툴 식별자 (Claude가 어떤 툴을 호출할지 이 이름으로 지정)
  // - description: 이 툴이 무엇을 하는지 Claude에게 설명 — 프롬프트처럼 작동하므로 구체적으로 작성할수록 정확도 높아짐
  // - input_schema: Claude가 툴을 호출할 때 생성해서 돌려줄 JSON의 형태 (JSON Schema 형식)
  //   "이런 구조의 JSON을 만들어서 줘"라는 출력 명세 — Claude가 이 스키마에 맞춰 JSON을 생성함
  // tools를 정의하면 Claude의 응답 content 배열에 tool_use 블록이 포함됨
  // → runWithTool()이 이 블록에서 input(JSON)을 추출해 반환
  tools?: Anthropic.Tool[];
  // API의 tool_choice 파라미터를 추상화한 값. buildParams()에서 실제 API 형식으로 변환됨
  // - 미지정: tool_choice: { type: 'any' } → tools 중 아무 툴이나 반드시 호출
  // - 지정:   tool_choice: { type: 'tool', name: toolName } → 해당 툴만 반드시 호출
  // (tool_choice: { type: 'auto' } 는 Claude가 툴 사용 여부를 자유롭게 결정 — 이 서비스에서는 미사용)
  toolName?: string;
  // Claude가 한 번에 생성할 수 있는 최대 토큰 수. 기본값 8192
  maxTokens?: number;
}

@Injectable()
export class ClaudeAgentService {
  private readonly logger = new Logger(ClaudeAgentService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.getOrThrow<string>('CLAUDE_API_KEY');
    const timeout = config.get<number>('CLAUDE_API_TIMEOUT', 120_000);
    const maxRetries = config.get<number>('CLAUDE_API_MAX_RETRIES', 2);

    this.model = config.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6');
    this.client = new Anthropic({ apiKey, timeout, maxRetries });
  }

  // Claude의 응답을 토큰 단위로 실시간 수신하는 AsyncGenerator.
  // runWithTool()과 달리 응답이 완성될 때까지 기다리지 않고, 생성되는 즉시 이벤트를 하나씩 yield함.
  //
  // 내부 동작:
  // 1. client.messages.stream()으로 Anthropic API에 스트리밍 요청
  // 2. API는 응답을 청크 단위로 전송 — 각 청크가 MessageStreamEvent 하나에 대응
  // 3. for await로 이벤트를 순서대로 받아 yield → 호출부에서 for await로 소비
  //
  // MessageStreamEvent 주요 타입:
  // - message_start: 응답 시작 (모델명, 사용 토큰 수 등 메타정보 포함)
  // - content_block_delta: 실제 텍스트/JSON 조각이 담긴 이벤트 — 가장 자주 발생
  // - message_stop: 응답 완료
  //
  // async *: 이 함수가 AsyncGenerator임을 선언. yield로 값을 하나씩 내보내며 일시 정지,
  //          호출부가 next()를 요청할 때마다 재개됨 (일반 함수처럼 한 번에 return하지 않음)
  async *stream(options: ClaudeCallOptions): AsyncGenerator<Anthropic.MessageStreamEvent> {
    const params = this.buildParams(options);
    const messageStream = this.client.messages.stream(params as Anthropic.MessageStreamParams);
    for await (const event of messageStream) {
      yield event;
    }
  }

  // 스트리밍 없이 Claude를 호출하고, 응답에서 tool_use 블록을 추출해 반환.
  // Phase 1(분석 문서 생성), Phase 2(태스크 목록 생성)처럼 구조화된 JSON 출력이 필요할 때 사용.
  //
  // 동작 흐름:
  // 1. messages.create()로 단건 요청 — 응답이 완성될 때까지 대기
  // 2. 응답의 content 배열에서 type === 'tool_use'인 블록을 찾음
  // 3. 블록의 input(Claude가 생성한 JSON)을 toolInput으로 반환
  // 4. tool_use 블록이 없으면 에러 — tools + tool_choice 설정이 잘못됐거나 Claude가 텍스트로만 답한 경우
  async runWithTool(options: ClaudeCallOptions): Promise<ToolResult> {
    const params = this.buildParams(options);
    // messages.create(): 비스트리밍 단건 요청. 응답 전체가 완성된 후 한 번에 반환
    const response = await this.client.messages.create(
      params as Anthropic.MessageCreateParamsNonStreaming,
    );

    // content는 배열 — 텍스트(text)와 툴 호출(tool_use) 블록이 섞여 있을 수 있음
    const toolUseBlock = response.content.find(
      // 타입 가드: block이 ToolUseBlock임을 TypeScript에 알려줘서 이후 block.name, block.input 접근 가능
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      throw new Error(`Claude did not return a tool_use block (stop_reason: ${response.stop_reason})`);
    }

    this.logger.debug(`Tool called: ${toolUseBlock.name}`);
    return { toolName: toolUseBlock.name, toolInput: toolUseBlock.input };
  }

  // 여러 툴을 순서대로 호출하는 에이전트 루프.
  // Claude가 tool_use를 반환하면 onToolCall 콜백을 실행하고 결과를 tool_result로 전달,
  // stop_reason이 end_turn이 될 때까지 반복함.
  //
  // 대화 흐름:
  // user 메시지 → Claude(tool_use #1) → tool_result 전달
  //             → Claude(tool_use #2) → tool_result 전달
  //             → Claude(end_turn) → 루프 종료
  //
  // tool_choice: 'auto' — Claude가 어떤 툴을 언제 호출할지 스스로 판단.
  // 시스템 프롬프트에서 호출 순서를 지시해야 올바른 순서 보장됨.
  async runAgentLoop(options: AgentLoopOptions): Promise<void> {
    const { messages, system, tools, onToolCall, maxTokens = 8192, maxIterations = 10 } = options;

    // 대화 히스토리 — 루프를 돌며 assistant 응답과 tool_result가 누적됨
    const history: Anthropic.MessageParam[] = [...messages];

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens, messages: history,
        // system이 있을 때만 { system: system }을 펼쳐 포함시킴.
        // system && { system }: system이 truthy면 { system: '...' } 반환, falsy면 undefined 반환.
        // ...undefined는 아무 프로퍼티도 추가하지 않으므로 system이 없으면 키 자체가 생략됨.
        ...(system && { system }),
        // tools는 { tools: tools }의 축약형 (ES6 단축 프로퍼티명)
        tools,
        // auto: Claude가 툴 사용 여부와 순서를 결정. 시스템 프롬프트로 순서 유도
        tool_choice: { type: 'auto' },
      } as Anthropic.MessageCreateParamsNonStreaming);

      // assistant 응답을 히스토리에 추가 — 다음 호출 시 Claude가 이전 응답을 맥락으로 활용
      history.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') break;

      if (response.stop_reason === 'tool_use') {
        // 한 번의 응답에 여러 tool_use 블록이 있을 수 있으므로 전부 처리
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            this.logger.debug(`Tool called: ${block.name}`);
            const result = await onToolCall(block.name, block.input);
            toolResults.push({
              type: 'tool_result',
              // tool_use_id: Claude가 발급한 ID — tool_result와 tool_use를 연결하는 키
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        // tool_result를 user 메시지로 전달 — Claude가 결과를 보고 다음 툴을 호출
        history.push({ role: 'user', content: toolResults });
      }

      if (i === maxIterations - 1) {
        this.logger.warn(`runAgentLoop reached maxIterations(${maxIterations}) without end_turn`);
      }
    }
  }

  // stream()과 runWithTool() 양쪽에서 공통으로 쓰는 Anthropic API 파라미터를 조립.
  // ClaudeCallOptions(이 서비스의 추상화)를 Anthropic SDK가 받는 실제 형식으로 변환.
  private buildParams(options: ClaudeCallOptions): Anthropic.MessageCreateParams {
    const { messages, system, tools, toolName, maxTokens = 8192 } = options;

    const params: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: maxTokens,
      messages,
    };

    // system은 선택값 — 없으면 파라미터에 포함하지 않음
    if (system) params.system = system;

    if (tools && tools.length > 0) {
      params.tools = tools;
      // toolName 지정 시 해당 툴만 강제, 없으면 any(어떤 툴이든 반드시 사용)
      params.tool_choice = toolName
        ? { type: 'tool', name: toolName }
        : { type: 'any' };
    }

    return params;
  }
}
