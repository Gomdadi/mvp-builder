# Frontend 구현 플랜 (E10)

## Context

백엔드 파이프라인(Phase 1~4, SSE, 세션 기반 인증)이 완성된 상태에서 프론트엔드를 새로 구축한다.
`apps/frontend/` 폴더가 아직 존재하지 않으며, 다음 설계 결정이 확정됐다:

- **프레임워크**: React + Vite (Next.js 제외)
- **인증**: GitHub OAuth 제거 → 세션 기반. S1 랜딩에서 "시작하기" 클릭 시 모달로 GitHub PAT + Claude API Key 입력
- **대시보드**: 생략. 랜딩 → /projects/new → /projects/:id/pipeline → /projects/:id/complete 선형 플로우
- **UI 스타일**: 다크모드 + 미니멀 (#0A0A0A 배경, 그린/보라 포인트, 터미널 폰트)

---

## 구현 화면 (5개)

| 경로 | 화면 | 설명 |
|------|------|------|
| `/` | S1: 랜딩 | 히어로 + 시작하기 버튼 + 크레덴셜 모달 |
| `/projects/new` | S5: 프로젝트 생성 | 프로젝트명, 요구사항, 기술 스택 선택 |
| `/projects/:id/pipeline` | S6: 파이프라인 진행 | Phase 진행 스텝 + SSE 터미널 로그 |
| `/projects/:id/review` | S7: 분석 문서 검토 | ERD/API/아키텍처 탭 + 피드백 or 확정 |
| `/projects/:id/complete` | S8: 완료 | GitHub URL + 실행 가이드 |

---

## 기술 스택

```
React 18+ + Vite 5 + TypeScript strict
Tailwind CSS + shadcn/ui (dark theme)
React Router v6 (클라이언트 라우팅)
Zustand (세션 상태, localStorage persist)
TanStack Query v5 (API 데이터 페칭/캐싱)
mermaid (ERD 렌더링, S7)
react-markdown (마크다운 렌더링, S7)
```

---

## 구현 단계

### Step 1: 프로젝트 초기화

**검증**: `npm run dev` → localhost:5173 빈 화면 확인

```bash
# apps/frontend/ 에 Vite + React 프로젝트 생성
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
# 추가 패키지
npm i react-router-dom zustand @tanstack/react-query mermaid react-markdown
npm i -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
# shadcn/ui (Vite 용)
npx shadcn@latest init   # dark theme, CSS variables
```

`tailwind.config.ts` 다크 테마 팔레트:
- background: `#0A0A0A`, foreground: `#E5E5E5`
- accent-green: `#22C55E`, accent-purple: `#A855F7`
- font-mono: JetBrains Mono (Google Fonts import)

`vite.config.ts` proxy 설정: `/v1` → `http://localhost:3000` (CORS 우회)

---

### Step 2: 공통 인프라

파일: `src/types/api.ts`, `src/lib/api.ts`, `src/lib/sse.ts`, `src/store/session.ts`

**`src/types/api.ts`** — 백엔드 API 타입 정의
```typescript
interface Project { id, name, requirements, techStack, status, githubRepoUrl, createdAt }
interface AnalysisDocument { id, projectId, version, erd, apiSpec, architecture, isConfirmed }
interface Task { id, name, type, orderIndex, status }
type SseEventType = 'phase_started' | 'phase_completed' | 'task_started' | 'task_completed' | 'pipeline_completed' | 'pipeline_failed'
interface SseEvent { type, phase?, taskId?, taskName?, analysisDocumentId?, pipelineRunId?, githubRepoUrl?, message?, timestamp }
```

**`src/lib/api.ts`** — fetch wrapper
- `getSessionId()` from localStorage 후 `X-Session-Id` 헤더 자동 추가
- 함수: `createSession`, `createProject`, `startPipeline`, `confirmPipeline`, `feedbackPipeline`, `getProject`, `getAnalysisDocument`, `getTasksByPipelineRun`

**`src/lib/sse.ts`** — `useSSE(projectId)` 커스텀 훅
- `EventSource('/v1/pipeline/:id/stream')` 연결
- 자동 재연결 최대 3회 (실패 시 `onError` 콜백)
- 이벤트 배열 상태 반환

**`src/store/session.ts`** — Zustand persist
```typescript
// localStorage에 지속: sessionId
{ sessionId: string | null, setSessionId, clearSession }
```

**`src/main.tsx`** — 앱 진입점
```typescript
// QueryClientProvider, BrowserRouter 설정
// React.StrictMode
```

---

### Step 3: 공통 컴포넌트 7개

파일: `src/components/`

| 컴포넌트 | 역할 |
|---------|------|
| `SessionModal.tsx` | GitHub PAT + Claude API Key + isPrivate 입력. POST /v1/session 호출 |
| `Header.tsx` | 로고(MVP Builder) + 현재 페이지 표시 |
| `StatusBadge.tsx` | ProjectStatus enum → 색상 배지 |
| `PipelineProgress.tsx` | Phase 1 → 2 → 3 가로 스텝 UI |
| `StreamingLog.tsx` | SSE 이벤트를 터미널 스타일(JetBrains Mono, 그린 텍스트)로 실시간 표시 |
| `MarkdownViewer.tsx` | react-markdown 렌더링. mermaid 코드 블록은 SVG 다이어그램으로 치환 |
| `CodeBlock.tsx` | 복사 버튼 있는 코드 블록 (터미널 스타일) |
| `FileTree.tsx` | 파일 트리 네비게이터. 폴더 펼치기/접기, 파일 선택 클릭 |

---

### Step 4: 라우팅 설정

`src/App.tsx`에 React Router 라우트 정의:

```typescript
<Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/projects/new" element={<NewProjectPage />} />
  <Route path="/projects/:id/pipeline" element={<PipelinePage />} />
  <Route path="/projects/:id/review" element={<ReviewPage />} />
  <Route path="/projects/:id/complete" element={<CompletePage />} />
</Routes>
```

세션 없는 경우 `/projects/*` → `/` 리다이렉트하는 `ProtectedRoute` 래퍼 추가.

---

### Step 5: S1 — 랜딩 페이지 (`src/pages/LandingPage.tsx`)

**검증**: 시작하기 클릭 → 모달 열림 → 폼 제출 → /projects/new 이동 확인

- 히어로: "자연어 → 실행 가능한 코드베이스 → 내 GitHub"
- 3단계 아이콘: `요구사항 자연어` → `문서 자동생성` → `GitHub 자동전달`
- "시작하기" 버튼 → `SessionModal` 열기
- 세션이 이미 있으면 바로 `/projects/new`로 리다이렉트
- 모달 완료(POST /v1/session 성공) → sessionId 저장 → `/projects/new` navigate

---

### Step 6: S5 — 프로젝트 생성 (`src/pages/NewProjectPage.tsx`)

**검증**: 폼 제출 → /projects/:id/pipeline 이동 확인

- 세션 없으면 `/` 리다이렉트
- 필드: 프로젝트명(1~200자), 요구사항(textarea, 10자 이상), 기술 스택 드롭다운 3개
  - Frontend: `Next.js` | `React` | `Vue`
  - Backend: `NestJS` | `Express` | `FastAPI`
  - Database: `PostgreSQL` | `MySQL` | `MongoDB`
- 제출: `POST /v1/projects` → `POST /v1/pipeline/:id/start` → `/projects/:id/pipeline` navigate

---

### Step 7: S6 — 파이프라인 진행 (`src/pages/PipelinePage.tsx`)

**검증**: SSE 이벤트 수신 → 로그 실시간 갱신 → phase_completed PHASE_1 → /review 이동 확인

좌/우 2-컬럼 레이아웃:
- 좌측: `PipelineProgress` (3단계) + `StreamingLog` (터미널 로그)
- 우측: **Phase 결과 패널** — Phase 완료 시마다 결과 표시

**StreamingLog 이벤트 포맷:**
- `phase_started` → "▶ Phase N 시작..."
- `task_started` → "  → [Task명] 생성 중..."
- `task_completed` → "  ✓ [Task명] 완료"
- `pipeline_failed` → "✗ 오류: [message]" (빨간 텍스트)

**Phase 결과 패널 — 우측 (단계별 갱신):**

| 이벤트 | API 호출 | 표시 내용 |
|--------|---------|---------|
| `phase_completed PHASE_1` | `GET /v1/analysis-documents/:analysisDocumentId` | 분석 문서 요약 미리보기 (탭: ERD / API 스펙 / 아키텍처, `MarkdownViewer` 사용) |
| `phase_completed PHASE_2` | `GET /v1/pipeline-runs/:pipelineRunId/tasks` | 태스크 목록 카드 (name, description, type 배지, orderIndex, status 배지) |
| `task_completed` | — (SSE 이벤트만) | Phase 2 태스크 목록에서 해당 task status → DONE 업데이트 |
| `pipeline_completed` | — | "완료" 메시지 표시 후 S8로 이동 |

결과 패널은 최신 Phase 결과로 교체 (Phase 1 → Phase 2 완료 시 태스크 목록으로 덮어씀).

**자동 이동:**
- `phase_completed PHASE_1` + `analysisDocumentId` → `/projects/:id/review?docId=XXX` (2초 딜레이 후)
- `pipeline_completed` + `githubRepoUrl` → `/projects/:id/complete`

**에러 처리:**
- `pipeline_failed` → 에러 배너 + "처음부터 다시 시작" 버튼
- SSE 재연결 실패(3회) → "새로고침 후 재시도" 안내

---

### Step 8: S7 — 분석 문서 검토 (`src/pages/ReviewPage.tsx`)

**검증**: ERD 탭 클릭 → Mermaid 다이어그램 렌더링, 확정 클릭 → /pipeline 이동 확인

- URL searchParam: `?docId=` (S6에서 전달)
- `GET /v1/analysis-documents/:docId` → TanStack Query
- 탭 3개: `ERD` | `API 스펙` | `아키텍처`
  - 각 탭에 `MarkdownViewer` (mermaid erDiagram 렌더링 포함)
- 피드백 textarea (선택 입력)
- 버튼 2개:
  - "재분석 요청" → `POST /v1/pipeline/:id/feedback` → `/projects/:id/pipeline` navigate
  - "이대로 확정" → `POST /v1/pipeline/:id/confirm` → `/projects/:id/pipeline` navigate

---

### Step 9: S8 — 완료 화면 (`src/pages/CompletePage.tsx`)

**검증**: GitHub URL 복사 버튼 동작, 파일 트리 펼치기/내용 확인, 새 프로젝트 버튼 이동 확인

상단 + 하단 2-섹션 레이아웃:

**상단: GitHub 배포 정보**
- `GET /v1/projects/:id` → TanStack Query로 githubRepoUrl 조회
- GitHub 저장소 URL + 복사 버튼
- 실행 가이드 `CodeBlock`:
  ```bash
  git clone {githubRepoUrl}
  cd {repoName}
  docker compose up --build
  ```
- "GitHub에서 보기" 링크 (새 탭)

**하단: 생성된 파일 브라우저**
- `GET /v1/projects/:id/files` → 파일 트리 (`FileNode[]`) 조회
- `FileTree` 컴포넌트: 폴더/파일 계층 구조, 파일 클릭으로 내용 조회
  - 폴더: 기본 펼침 상태, 클릭으로 접기/펼치기
  - 파일 클릭: `GET /v1/projects/:id/files?path=...` → 파일 내용 표시
- 우측: `CodeBlock`으로 선택된 파일 내용 표시 (파일 확장자 기반 언어 하이라이팅)
- 파일 브라우저는 좌: `FileTree` / 우: `CodeBlock` 2-컬럼

`FileTree` 컴포넌트 추가: `src/components/FileTree.tsx`

**하단 버튼:**
- "새 프로젝트 만들기" → `/projects/new`

---

## 파일 구조

```
apps/frontend/
├── src/
│   ├── main.tsx                          # QueryClientProvider, BrowserRouter
│   ├── App.tsx                           # 라우트 정의
│   ├── index.css                         # Tailwind 지시문
│   ├── pages/
│   │   ├── LandingPage.tsx               # S1
│   │   ├── NewProjectPage.tsx            # S5
│   │   ├── PipelinePage.tsx              # S6
│   │   ├── ReviewPage.tsx                # S7
│   │   └── CompletePage.tsx              # S8
│   ├── components/
│   │   ├── SessionModal.tsx
│   │   ├── Header.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── PipelineProgress.tsx
│   │   ├── StreamingLog.tsx
│   │   ├── MarkdownViewer.tsx
│   │   ├── CodeBlock.tsx
│   │   └── ui/                           # shadcn/ui (Button, Input, Tabs, Dialog 등)
│   ├── lib/
│   │   ├── api.ts
│   │   └── sse.ts
│   ├── store/
│   │   └── session.ts
│   └── types/
│       └── api.ts
├── package.json
├── vite.config.ts                        # /v1 proxy → localhost:3000
├── tailwind.config.ts
└── tsconfig.json
```

---

## 검증 계획

전체 E2E 플로우를 로컬에서 수동 검증:

1. `docker-compose up -d` (Postgres + Redis + LocalStack)
2. 백엔드: `cd apps/backend && npm run dev`
3. 프론트: `cd apps/frontend && npm run dev`
4. 브라우저에서 확인:
   - [ ] `/` 랜딩 → 시작하기 → 모달에서 GitHub PAT + Claude API Key 입력 → 세션 생성 성공
   - [ ] `/projects/new` → 폼 입력 → 분석 시작
   - [ ] `/projects/:id/pipeline` → SSE 로그 실시간 표시 → Phase 1 완료 → /review 자동 이동
   - [ ] `/projects/:id/review` → ERD Mermaid 렌더링 → 확정 클릭 → /pipeline 이동
   - [ ] `/projects/:id/pipeline` → Phase 2/3 진행 → pipeline_completed → /complete 자동 이동
   - [ ] `/projects/:id/complete` → GitHub URL 표시 → 복사 버튼 동작
