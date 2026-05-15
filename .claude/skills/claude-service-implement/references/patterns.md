# Claude Service Implement 패턴 레퍼런스

## 목차

1. [공통 구조 (DI + 프롬프트 로딩)](#1-공통-구조)
2. [runAgentLoop 패턴](#2-runagentloop-패턴)
3. [runWithTool 패턴](#3-runwithtool-패턴)
4. [Task 상태 추적 (Phase 3)](#4-task-상태-추적)

---

## 1. 공통 구조

### 기본 골격 (Phase Service)

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeAgentService } from './claude-agent.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PhaseXService {
  private readonly systemPrompt: string;

  // Tool description을 static 필드로 선언 — 클래스 로딩 시 1회 초기화
  static readonly TOOLS: Anthropic.Tool[] = [
    {
      name: 'tool_name',
      description: PhaseXService.loadPrompt('phaseX-tool-name.md'),
      input_schema: {
        type: 'object',
        properties: {
          result_field: { type: 'string', description: '...' },
        },
        required: ['result_field'],
      },
    },
  ];

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    private readonly prisma: PrismaService,
    // Phase 3는 S3Service 추가
  ) {
    this.systemPrompt = PhaseXService.loadPrompt('phaseX-system.md');
  }

  private static loadPrompt(filename: string): string {
    return fs.readFileSync(path.join(__dirname, 'prompts', filename), 'utf-8');
  }
}
```

### nest-cli.json assets 설정 확인

빌드 후 dist에 MD 파일이 복사되지 않으면 `readFileSync`가 실패함.

```json
{
  "projects": {
    "backend": {
      "compilerOptions": {
        "assets": ["claude/prompts/**/*.md"]
      }
    }
  }
}
```

---

## 2. runAgentLoop 패턴

여러 tool이 순서대로 호출되어야 할 때 사용 (Phase 1, Phase 3 Backend).

### 전체 구현 예시

```typescript
async run(projectId: string): Promise<void> {
  const project = await this.prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });

  // 결과를 담을 지역 변수
  const result: Partial<{
    erd: string;
    apiSpec: string;
    architecture: string;
    directoryStructure: object[];
  }> = {};

  await this.claudeAgent.runAgentLoop({
    system: this.systemPrompt,
    messages: [
      {
        role: 'user',
        content: `요구사항:\n${project.requirements}`,
      },
    ],
    tools: PhaseXService.TOOLS,
    onToolCall: async (toolName, toolInput) => {
      switch (toolName) {
        case 'design_erd': {
          const input = toolInput as { erd: string };
          result.erd = input.erd;
          return 'ERD 완료. 이제 API 스펙을 설계하세요.';
        }
        case 'design_api_spec': {
          const input = toolInput as { api_spec: string };
          result.apiSpec = input.api_spec;
          return 'API 스펙 완료. 이제 아키텍처를 설계하세요.';
        }
        // ... 나머지 케이스
        default:
          return `Unknown tool: ${toolName}`;
      }
    },
  });

  // 루프 완료 후 필수 필드 검증
  if (!result.erd || !result.apiSpec || !result.architecture || !result.directoryStructure) {
    throw new Error('Agent loop did not produce all required outputs');
  }

  // 검증 통과 후 단 1회 저장
  await this.prisma.analysisDocument.create({
    data: {
      projectId,
      erd: result.erd,
      apiSpec: result.apiSpec,
      architecture: result.architecture,
      directoryStructure: result.directoryStructure,
    },
  });
}
```

### onToolCall 반환값 원칙

- 각 케이스는 Claude에게 **다음에 해야 할 tool**을 안내하는 문자열 반환
- 마지막 tool 케이스는 `'모든 설계 완료.'` 등 종료 안내

---

## 3. runWithTool 패턴

단 1개의 tool만 호출하면 되는 경우 (Phase 2, Phase 3 Frontend).

```typescript
async run(projectId: string): Promise<void> {
  const doc = await this.prisma.analysisDocument.findFirstOrThrow({
    where: { projectId, isConfirmed: true },
  });

  const { toolInput } = await this.claudeAgent.runWithTool({
    system: this.systemPrompt,
    messages: [
      {
        role: 'user',
        content: `분석 문서:\n${JSON.stringify(doc)}`,
      },
    ],
    tool: PhaseXService.TOOLS[0],
  });

  // toolInput 타입 단언 후 즉시 사용
  const input = toolInput as { tasks: Array<{ name: string; type: string; order_index: number }> };

  await this.prisma.task.createMany({
    data: input.tasks.map((t) => ({
      projectId,
      name: t.name,
      type: t.type,
      orderIndex: t.order_index, // Claude 반환(snake_case) → Prisma 필드(camelCase) 변환
    })),
  });
}
```

---

## 4. Task 상태 추적

Phase 3에서 각 Task의 실행 상태를 DB에 반영하는 패턴.

```typescript
async runTask(taskId: string): Promise<void> {
  // 시작 시 IN_PROGRESS
  await this.prisma.task.update({
    where: { id: taskId },
    data: { status: 'IN_PROGRESS' },
  });

  try {
    // ... 코드 생성 로직 (runAgentLoop 또는 runWithTool)

    // 성공 시 DONE
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'DONE' },
    });
  } catch (err) {
    // 실패 시 FAILED
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'FAILED' },
    });
    throw err; // 상위로 재throw
  }
}
```

### S3 업로드 연계 (Phase 3 Backend)

```typescript
// 생성된 파일들을 배열에 수집
const generated: Array<{ path: string; content: string }> = [];

// onToolCall 내에서
case 'generate_test_code': {
  const input = toolInput as { file_path: string; content: string };
  generated.push(input);
  return '테스트 코드 완료. 구현 코드를 작성하세요.';
}

// 루프 완료 후 병렬 S3 업로드
await Promise.all(
  generated.map((file) =>
    this.s3.upload(`generated/${projectId}/${file.path}`, file.content),
  ),
);
```
