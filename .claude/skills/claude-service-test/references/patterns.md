# Claude Service Test 패턴 레퍼런스

## 목차

1. [Phase Service 테스트 패턴](#1-phase-service-테스트-패턴)
2. [Agent Service 테스트 패턴](#2-agent-service-테스트-패턴)
3. [simulateAgentLoop 헬퍼](#3-simulateagentloop-헬퍼)
4. [검증 패턴](#4-검증-패턴)

---

## 1. Phase Service 테스트 패턴

`ClaudeAgentService.runAgentLoop`를 통해 Claude와 통신하는 서비스(phase1/2/3.service.ts).

### 파일 상단 Mock 선언

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { Phase1Service } from './phase1.service'; // 대상 서비스로 교체
import * as fs from 'fs';
import { execFileSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process', () => ({ execFileSync: jest.fn() }));

const mockReadFileSync = fs.readFileSync as jest.Mock;
const mockExecFileSync = execFileSync as jest.Mock;
```

### beforeEach 구성

```typescript
describe('Phase1Service', () => {
  let service: Phase1Service;

  const mockClaudeAgent = { runAgentLoop: jest.fn() };
  const mockPrisma = {
    project: { findUniqueOrThrow: jest.fn() },
    analysisDocument: { count: jest.fn(), create: jest.fn() },
    // 서비스에서 사용하는 모델만 선언
  };

  beforeEach(async () => {
    jest.clearAllMocks(); // 반환값도 초기화됨 → 아래에서 반드시 재설정

    // fs.readFileSync: prompts/*.md 로딩에 사용
    mockReadFileSync.mockReturnValue('mocked prompt content');
    // execFileSync: 외부 script 호출 (ui-ux-skill 등)
    mockExecFileSync.mockReturnValue(Buffer.from('{}'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Phase1Service,
        { provide: ClaudeAgentService, useValue: mockClaudeAgent },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<Phase1Service>(Phase1Service);
  });
```

### Phase3Service (S3 추가)

```typescript
import { S3Service } from '../s3/s3.service';

const mockS3 = {
  upload: jest.fn(),
  download: jest.fn(),
};

// providers에 추가
{ provide: S3Service, useValue: mockS3 },
```

---

## 2. Agent Service 테스트 패턴

`@anthropic-ai/sdk`를 직접 사용하는 `claude-agent.service.ts` 전용.

### 파일 상단 Mock 선언

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAgentService } from './claude-agent.service';

jest.mock('@anthropic-ai/sdk');
const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
```

### beforeEach 구성

```typescript
describe('ClaudeAgentService', () => {
  let service: ClaudeAgentService;
  let mockCreate: jest.Mock;
  let mockStream: jest.Mock;

  const mockConfig = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
    get: jest.fn().mockImplementation((_key: string, fallback: unknown) => fallback),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    mockStream = jest.fn();

    MockedAnthropic.mockImplementation(
      () => ({ messages: { create: mockCreate, stream: mockStream } }) as unknown as Anthropic,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeAgentService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ClaudeAgentService>(ClaudeAgentService);
  });
```

### messages.create 응답 mock 예시

```typescript
// tool_use 응답
mockCreate.mockResolvedValueOnce({
  content: [{ type: 'tool_use', name: 'my_tool', input: { key: 'value' } }],
  stop_reason: 'tool_use',
});

// 최종 텍스트 응답
mockCreate.mockResolvedValueOnce({
  content: [{ type: 'text', text: 'done' }],
  stop_reason: 'end_turn',
});
```

### stream mock (AsyncGenerator)

```typescript
async function* fakeStream() {
  yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } };
  yield { type: 'message_stop' };
}
mockStream.mockReturnValue(fakeStream());
```

---

## 3. simulateAgentLoop 헬퍼

Phase Service 테스트의 핵심. `runAgentLoop`의 `onToolCall` 콜백을 직접 호출해 tool 결과를 수집 로직에 주입한다.

```typescript
import type { RunAgentLoopOptions } from './claude-agent.service';

// 실제 서비스의 tool 이름에 맞게 교체
const simulateAgentLoop = async (options: RunAgentLoopOptions): Promise<void> => {
  await options.onToolCall('tool_name_1', { result_field: 'value1' });
  await options.onToolCall('tool_name_2', { result_field: 'value2' });
};

// 테스트에서 사용
mockClaudeAgent.runAgentLoop.mockImplementation(simulateAgentLoop);
```

### Phase1 예시 (4개 tool)

```typescript
const simulatePhase1Loop = async (options: RunAgentLoopOptions): Promise<void> => {
  await options.onToolCall('design_erd', { erd: 'ERD content' });
  await options.onToolCall('design_api_spec', { api_spec: '# API Spec' });
  await options.onToolCall('design_architecture', { architecture: 'arch' });
  await options.onToolCall('design_directory_structure', {
    directory_structure: [{ path: 'src/', description: 'source' }],
  });
};
```

### 불완전 루프 시뮬레이션

```typescript
// 일부 tool만 호출 → 서비스가 필수 결과 누락 감지 후 throw
const incompleteLoop = async (options: RunAgentLoopOptions): Promise<void> => {
  await options.onToolCall('design_erd', { erd: 'only erd' });
  // api_spec, architecture, directory_structure 누락
};

mockClaudeAgent.runAgentLoop.mockImplementation(incompleteLoop);
await expect(service.run('proj-1')).rejects.toThrow();
```

---

## 4. 검증 패턴

### DB 저장 확인

```typescript
expect(mockPrisma.analysisDocument.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    projectId: 'proj-1',
    erd: 'ERD content',
    apiSpec: '# API Spec',
  }),
});
```

### N번째 호출 검증

```typescript
// Prisma update가 IN_PROGRESS → DONE 순으로 호출됐는지
expect(mockPrisma.task.update).toHaveBeenNthCalledWith(1, {
  where: { id: 'task-1' },
  data: { status: 'IN_PROGRESS' },
});
expect(mockPrisma.task.update).toHaveBeenNthCalledWith(2, {
  where: { id: 'task-1' },
  data: { status: 'DONE' },
});
```

### 에러 시 DB 저장 금지

```typescript
mockClaudeAgent.runAgentLoop.mockRejectedValue(new Error('API error'));
await expect(service.run('proj-1')).rejects.toThrow('API error');
expect(mockPrisma.analysisDocument.create).not.toHaveBeenCalled();
```

### API 실패 케이스 (Agent Service)

```typescript
mockCreate.mockRejectedValue(new Error('Anthropic API error'));
await expect(service.runWithTool('prompt', tool, {})).rejects.toThrow('Anthropic API error');
```
