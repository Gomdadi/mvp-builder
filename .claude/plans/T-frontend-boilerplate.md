# 백엔드/프론트엔드 보일러플레이트 태스크 분리

## Context

현재 보일러플레이트 태스크(orderIndex=0, BACKEND)는 백엔드 테스트 환경(`_env/` 파일들)만 생성한다.
프론트엔드가 있는 프로젝트에서는 `package.json`, `vite.config.ts`, `src/main.tsx` 같은
프론트엔드 기반 파일도 필요하지만, 단일 프롬프트에 두 영역을 합치면 few-shot 예시로 인해 너무 길어진다.

**설계**: Phase 2가 두 개의 orderIndex=0 태스크를 생성하도록 변경한다.
- `orderIndex=0, type=BACKEND` → 백엔드 보일러플레이트 (`_env/` 환경 파일)
- `orderIndex=0, type=FRONTEND` → 프론트엔드 보일러플레이트 (프로젝트 기반 파일)

`(pipelineRunId, orderIndex)` 인덱스는 unique 제약이 없으므로 중복 orderIndex 허용됨.
TaskWorker는 `concurrency:1 + FIFO`로 삽입 순서(백엔드 먼저) 보장.

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `prompts/phase3-boilerplate-system.md` | 이름 변경 → `phase3-boilerplate-backend-system.md` (내용 유지) |
| `prompts/phase3-boilerplate-frontend-system.md` | 신규 |
| `prompts/phase2-system.md` | 프론트엔드 보일러플레이트 태스크 생성 지침 추가 |
| `prompts/phase2-tool-tasks.md` | 프론트엔드 보일러플레이트 예시 추가 |
| `claude/phase3.service.ts` | 라우팅 변경, 신규 메서드·필드 추가 |
| `claude/phase3.service.spec.ts` | 기존 테스트 수정, 프론트엔드 보일러플레이트 테스트 추가 |

---

## 1. 프롬프트 파일

### `phase3-boilerplate-backend-system.md` (기존 파일 이름 변경)
내용 변경 없음. 파일명만 `phase3-boilerplate-system.md` → `phase3-boilerplate-backend-system.md`.

### `phase3-boilerplate-frontend-system.md` (신규)
- 역할: 프론트엔드 프로젝트 기반 파일을 생성하는 시니어 엔지니어
- **`_env/` 접두사 사용 금지** — 실제 프로젝트 파일 경로 그대로 사용
- `docker-compose.yml`, 테스트 설정 파일 생성 금지 (테스트는 백엔드 보일러플레이트 담당)
- directoryStructure에서 프레임워크 감지:
  - `.tsx` 파일 → React + Vite
  - `.vue` 파일 → Vue + Vite
  - `pages/` 디렉토리 → Next.js
- React + Vite + TypeScript 기준 생성 파일:
  - `package.json` (react, react-dom, typescript, vite, @vitejs/plugin-react devDeps)
  - `vite.config.ts` (React 플러그인, directoryStructure의 path alias)
  - `tsconfig.json` (jsx: react-jsx, strict, paths)
  - `tsconfig.node.json`
  - `index.html` (Vite entry, `<div id="root">`)
  - `src/main.tsx` (ReactDOM.createRoot)
  - `src/App.tsx` (최소 루트 컴포넌트)

---

## 2. Phase 2 프롬프트 변경

### `phase2-system.md`
기존 규칙 ("첫 번째 태스크는 반드시 boilerplate") 아래에 추가:
```
- 프로젝트에 프론트엔드 파일(*.tsx, *.vue, *.svelte, pages/, components/)이 있으면
  추가로 프론트엔드 보일러플레이트 태스크를 생성한다:
  { name: "Set up frontend boilerplate", type: "FRONTEND", order_index: 0 }
  이 태스크는 프론트엔드 프로젝트 기반 파일을 생성하며 docker-compose나 테스트 설정은 포함하지 않는다.
```

### `phase2-tool-tasks.md`
프론트엔드 보일러플레이트 예시 추가:
```json
{
  "name": "Set up frontend boilerplate",
  "description": "Generate frontend project foundation files: package.json (react, react-dom, typescript, vite, @vitejs/plugin-react), vite.config.ts (path aliases from directory structure), tsconfig.json (jsx: react-jsx, strict), index.html, src/main.tsx, src/App.tsx. No test config or docker-compose needed.",
  "type": "FRONTEND",
  "order_index": 0
}
```

---

## 3. `phase3.service.ts` 변경

### 필드 및 생성자
```typescript
// 기존
private readonly boilerplateSystemPrompt: string;

// 변경
private readonly backendBoilerplateSystemPrompt: string;
private readonly frontendBoilerplateSystemPrompt: string;

// 생성자
this.backendBoilerplateSystemPrompt = Phase3Service.loadPrompt('phase3-boilerplate-backend-system.md');
this.frontendBoilerplateSystemPrompt = Phase3Service.loadPrompt('phase3-boilerplate-frontend-system.md');
```

### `run()` 라우팅 변경
```typescript
// 기존
if (task.orderIndex === 0) {
  await this.runBoilerplate(...)
}

// 변경
if (task.orderIndex === 0 && task.type === TaskType.BACKEND) {
  await this.runBackendBoilerplate(...)
} else if (task.orderIndex === 0 && task.type === TaskType.FRONTEND) {
  await this.runFrontendBoilerplate(...)
} else if (task.type === TaskType.FRONTEND) {
  await this.runFrontend(...)
} else {
  await this.runBackend(...)
}
```

### 메서드 이름 변경
- `runBoilerplate()` → `runBackendBoilerplate()` (내용 동일, 이름만 변경)
- `runFrontendBoilerplate()` 신규 추가 — `runBackendBoilerplate()`와 거의 동일한 구조, `frontendBoilerplateSystemPrompt` 사용

---

## 4. `phase3.service.spec.ts` 변경

### 기존 보일러플레이트 테스트 수정
`fakeBoilerplateTask.type`에 `TaskType.BACKEND` 명시 추가 (현재 `'BACKEND' as const`로 되어 있어 변경 없을 수도 있음).

### 프론트엔드 보일러플레이트 테스트 추가
```typescript
// 픽스처
const fakeFrontendBoilerplateTask = {
  id: 'task-fe-bp',
  name: 'Set up frontend boilerplate',
  description: 'Generate frontend project files',
  type: TaskType.FRONTEND,
  orderIndex: 0,
};

it('[frontend boilerplate] orderIndex=0 FRONTEND이면 프론트엔드 기반 파일을 생성하고 DONE으로 갱신한다', ...)
it('[frontend boilerplate] 파일이 하나도 생성되지 않으면 FAILED로 갱신한다', ...)
```

---

## 구현 순서

```
1. prompts/phase3-boilerplate-system.md → phase3-boilerplate-backend-system.md (이름 변경)
2. prompts/phase3-boilerplate-frontend-system.md 신규 작성
3. prompts/phase2-system.md 수정
4. prompts/phase2-tool-tasks.md 수정
5. phase3.service.ts 수정
6. phase3.service.spec.ts 수정
```

---

## 검증

```bash
cd apps/backend && npx jest src/claude/phase3.service.spec.ts --no-coverage
```

기대: 기존 10개 + 신규 2개 = 12개 테스트 통과.
