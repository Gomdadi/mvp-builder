# API 스펙
# mvp-builder

> 작성일: 2026-03-17 (수정: 2026-03-26)
> 작성자: Architecture Agent (3단계)
> 기반 문서: `docs/PRD.md`, `docs/MVP-scope.md`, `docs/tech-stack.md`, `docs/system-architecture.md`
> MVP In-scope 기능(F-01~F-08, F-02a~F-02c)만 설계한다.

---

## 1. Base URL 및 버전 관리

| 환경 | Base URL |
|------|----------|
| 로컬 개발 | `http://localhost:3000/api/v1` |
| 프로덕션 | `https://api.mvp-builder.com/api/v1` |

- 버전은 URL path prefix `/api/v1`으로 관리한다.
- 하위 호환 불가 변경 시 `/api/v2`로 신규 버전을 추가한다. 구버전은 Deprecation 공지 후 최소 3개월 유지한다.

---

## 2. 인증 방식

### 2.1 GitHub OAuth 2.0

- 로그인은 GitHub OAuth를 통해서만 가능하다.
- OAuth 완료 후 서버가 JWT Access Token을 발급한다.
- Access Token 만료 시간: **15분**

```
Authorization: Bearer <accessToken>
```

### 2.2 토큰 만료 처리

```
API 호출 → 401 응답
  → GET /auth/github 재호출 (GitHub 재인증)
  → 또는 로그인 페이지로 리다이렉트
```

---

## 3. 공통 에러 코드

### 3.1 HTTP 상태 코드 정의

| 상태 코드 | 의미 | 사용 케이스 |
|----------|------|------------|
| 200 | OK | 조회/수정 성공 |
| 201 | Created | 리소스 생성 성공 |
| 204 | No Content | 삭제 성공 (응답 바디 없음) |
| 400 | Bad Request | 요청 파라미터/바디 유효성 검사 실패 |
| 401 | Unauthorized | 인증 토큰 없음/만료/유효하지 않음 |
| 403 | Forbidden | 권한 없음 (타인 리소스 접근 등) |
| 404 | Not Found | 리소스를 찾을 수 없음 |
| 409 | Conflict | 중복 리소스 또는 상태 충돌 |
| 422 | Unprocessable Entity | 비즈니스 로직 검증 실패 |
| 429 | Too Many Requests | Rate Limiting 초과 (MVP 초기 미적용, 예약) |
| 500 | Internal Server Error | 서버 내부 오류 |

### 3.2 에러 응답 형식

```json
{
  "statusCode": 400,
  "message": "요구사항은 최대 10,000자까지 입력 가능합니다.",
  "error": "Bad Request",
  "timestamp": "2026-03-26T12:00:00.000Z",
  "path": "/api/v1/generation"
}
```

### 3.3 도메인별 에러 코드

| 코드 | 메시지 | HTTP 상태 |
|------|--------|-----------|
| `AUTH_001` | 유효하지 않은 인증 토큰입니다. | 401 |
| `AUTH_003` | 만료되거나 유효하지 않은 토큰입니다. | 401 |
| `USER_001` | 이미 사용 중인 username입니다. | 409 |
| `GEN_001` | 이미 생성 작업이 진행 중입니다. | 409 |
| `GEN_002` | 생성 작업을 찾을 수 없습니다. | 404 |
| `GEN_003` | 요구사항은 최대 10,000자까지 입력 가능합니다. | 400 |
| `GEN_004` | 생성 작업이 타임아웃되었습니다. 요구사항을 간소화한 후 재시도해주세요. | 422 |
| `GEN_005` | Claude API 호출 또는 생성 파이프라인 내부 오류가 발생했습니다. | 500 |
| `GEN_006` | 피드백을 제출할 수 없는 상태입니다. awaiting_feedback 상태에서만 가능합니다. | 409 |
| `GEN_007` | 아직 해당 단계가 완료되지 않았습니다. | 422 |

---

## 4. 엔드포인트 목록

### 4.1 인증 (Auth)

---

#### `GET /auth/github` — GitHub OAuth 시작

**설명**: GitHub OAuth 인증 페이지로 리다이렉트. 로그인 및 회원가입 모두 이 엔드포인트로 시작한다.

**인증 필요**: 없음

**Response 302**: GitHub OAuth 인증 페이지로 리다이렉트

---

#### `GET /auth/github/callback` — GitHub OAuth 콜백

**설명**: GitHub OAuth 완료 후 콜백. code를 access_token으로 교환하고 JWT를 발급한다.

**인증 필요**: 없음

**Query Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| code | string | GitHub OAuth 인증 코드 |
| state | string | CSRF 방지용 state 값 |

**동작**:
- 신규 사용자: GitHub 사용자 정보로 계정 자동 생성
- 기존 사용자: github_access_token 갱신

**Response 302**: 프론트엔드 URL로 리다이렉트 (`?accessToken=<jwt>`)

**에러**:
- `400` — 유효하지 않은 code 또는 state

---

#### `POST /auth/logout` — 로그아웃

**설명**: 현재 세션 종료.

**인증 필요**: Bearer Token

**Request**: 바디 없음

**Response 204**: 바디 없음

---

### 4.2 사용자 (User)

---

#### `GET /users/me` — 내 프로필 조회

**설명**: 로그인한 사용자의 프로필 정보 조회.

**인증 필요**: Bearer Token

**Response 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "githubUsername": "john-doe",
  "username": "john-doe",
  "email": "john@example.com",
  "createdAt": "2026-03-26T12:00:00.000Z"
}
```

---

### 4.3 생성 (Generation)

---

#### `POST /generation` — MVP 생성 요청

**설명**: 자연어 요구사항으로 MVP 생성 작업을 시작한다. BullMQ 큐에 enqueue되며 jobId를 반환한다.

**인증 필요**: Bearer Token

**Request Body**

```json
{
  "requirements": "할 일 목록을 관리할 수 있는 웹 서비스. 할 일 추가, 완료 처리, 삭제 기능이 필요합니다.",
  "developerOptions": {
    "techStack": "Next.js + TypeScript",
    "architecture": "monolith",
    "deployment": "Vercel"
  }
}
```

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| requirements | string | O | 1~10,000자 |
| developerOptions | object | X | 선택 입력 (개발자 옵션) |
| developerOptions.techStack | string | X | 최대 200자 |
| developerOptions.architecture | string | X | 최대 100자 |
| developerOptions.deployment | string | X | 최대 100자 |

**Response 201**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "pending",
  "message": "생성 작업이 시작되었습니다. SSE 연결을 통해 진행 상황을 확인하세요."
}
```

**에러**:
- `400 GEN_003` — 요구사항 길이 초과
- `409 GEN_001` — 이미 진행 중인 생성 작업 존재 (`{ jobId: "<기존 jobId>" }` 포함)

---

#### `GET /generation/:jobId/stream` — 생성 진행률 SSE 스트림

**설명**: SSE(Server-Sent Events)로 생성 진행 상황을 실시간 수신한다.

**인증 필요**: Bearer Token (Authorization 헤더 또는 Query Parameter `token`)

> 가정: 브라우저 `EventSource`는 커스텀 헤더를 지원하지 않으므로 `?token=<accessToken>` Query Parameter 방식을 병행 지원한다.

**Response Headers**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**SSE 이벤트 목록**

connected 이벤트 (연결 성공):
```
event: connected
data: {"jobId":"550e8400-e29b-41d4-a716-446655440001","message":"연결되었습니다."}
```

progress 이벤트 (단계 진행):
```
event: progress
data: {"stage":"analyzing","stageLabel":"요구사항 분석 중","percent":10,"message":"요구사항을 분석하고 있습니다."}
```

analysis_ready 이벤트 (분석 완료, 피드백 대기):
```
event: analysis_ready
data: {"jobId":"...","stage":"awaiting_feedback","stageLabel":"분석 완료 — 검토 필요","percent":20,"message":"분석이 완료되었습니다. 문서를 검토하고 피드백을 제출해주세요."}
```

progress 이벤트 (개발/테스트/업로드 단계):
```
event: progress
data: {"stage":"developing","stageLabel":"코드 생성 중","percent":60,"message":"파일을 생성하고 있습니다."}
```

```
event: progress
data: {"stage":"testing","stageLabel":"테스트 실행 중","percent":85,"message":"테스트를 실행하고 있습니다."}
```

```
event: progress
data: {"stage":"uploading","stageLabel":"GitHub 업로드 중","percent":95,"message":"GitHub 저장소에 업로드하고 있습니다."}
```

completed 이벤트 (완료):
```
event: completed
data: {"jobId":"...","cloneUrl":"https://github.com/john-doe/mvp-todo-app-john-doe","repoName":"mvp-todo-app-john-doe","percent":100,"testReport":{"passed":12,"failed":0,"total":12,"coverage":78,"summary":"전체 12개 테스트 통과"}}
```

error 이벤트 (실패):
```
event: error
data: {"stage":"developing","message":"코드 생성 중 오류가 발생했습니다. 다시 시도해주세요.","code":"GEN_005"}
```

timeout 이벤트 (타임아웃):
```
event: timeout
data: {"message":"생성 작업이 시간 초과되었습니다. 요구사항을 간소화한 후 재시도해주세요."}
```

**stage 값 정의**

| stage | 설명 | 퍼센트 범위 |
|-------|------|------------|
| `analyzing` | 요구사항 분석 및 문서 생성 | 0~20% |
| `awaiting_feedback` | 분석 완료, 사용자 피드백 대기 | 20% (고정) |
| `developing` | 코드 파일 생성 (피드백 반영) | 20~80% |
| `testing` | 테스트 실행 및 리포트 생성 | 80~90% |
| `uploading` | GitHub repo 생성 및 파일 업로드 | 90~99% |

**에러**:
- `404 GEN_002` — jobId에 해당하는 생성 작업 없음
- `403` — 다른 사용자의 jobId 접근 시도

---

#### `GET /generation/:jobId/analysis` — 분석 문서 조회

**설명**: analyzing 단계 완료 후 생성된 분석 문서(ERD, API 설계, 아키텍처 요약)를 조회한다. `awaiting_feedback` 또는 이후 상태에서만 접근 가능하다.

**인증 필요**: Bearer Token

**Response 200**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440001",
  "analysisDoc": {
    "erd": "## ERD\n\n```mermaid\nerDiagram\n...\n```",
    "apiDesign": "## API 설계\n\n### POST /todos\n...",
    "architecture": "## 아키텍처\n\n- Frontend: Next.js\n- Backend: Node.js + Express\n..."
  },
  "createdAt": "2026-03-26T12:00:00.000Z"
}
```

**에러**:
- `404 GEN_002` — 생성 작업 없음
- `403` — 타인 접근
- `422 GEN_007` — 아직 analyzing 단계 미완료 (status가 analyzing 또는 pending)

---

#### `POST /generation/:jobId/feedback` — 피드백 제출

**설명**: 분석 문서 검토 후 피드백을 제출한다. `awaiting_feedback` 상태에서만 가능하며, 제출 즉시 개발 단계가 시작된다.

**인증 필요**: Bearer Token

**Request Body**

```json
{
  "action": "approve",
  "feedback": "ERD는 괜찮은데 API에 pagination을 추가해주세요."
}
```

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| action | string | O | `"approve"` \| `"request_changes"` |
| feedback | string | X | 최대 5,000자. action이 `"request_changes"`일 때 권장. |

**Response 200**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "developing",
  "message": "피드백이 반영되었습니다. 코드 생성을 시작합니다."
}
```

**에러**:
- `404 GEN_002` — 생성 작업 없음
- `403` — 타인 접근
- `409 GEN_006` — `awaiting_feedback` 상태가 아님

---

#### `GET /generation/:jobId/test-report` — 테스트 리포트 조회

**설명**: testing 단계 완료 후 테스트 실행 결과를 조회한다. `uploading` 또는 `completed` 상태에서만 접근 가능하다.

**인증 필요**: Bearer Token

**Response 200**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440001",
  "testReport": {
    "passed": 12,
    "failed": 0,
    "total": 12,
    "coverage": 78,
    "summary": "전체 12개 테스트 통과. 커버리지 78%."
  },
  "createdAt": "2026-03-26T12:03:00.000Z"
}
```

**에러**:
- `404 GEN_002` — 생성 작업 없음
- `403` — 타인 접근
- `422 GEN_007` — 아직 testing 단계 미완료

---

#### `GET /generation` — 생성 이력 목록 조회

**설명**: 로그인한 사용자의 생성 이력을 최신순으로 조회한다.

**인증 필요**: Bearer Token

**Query Parameters**

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|----------|------|------|--------|------|
| page | number | X | 1 | 페이지 번호 |
| limit | number | X | 20 | 페이지당 항목 수 (최대 50) |
| status | string | X | 없음 | `pending` \| `analyzing` \| `awaiting_feedback` \| `developing` \| `testing` \| `uploading` \| `completed` \| `failed` \| `timeout` 필터 |

**Response 200**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "status": "completed",
      "requirementsSummary": "할 일 목록을 관리할 수 있는 웹 서비스...",
      "cloneUrl": "https://github.com/john-doe/mvp-todo-app-john-doe",
      "repoName": "mvp-todo-app-john-doe",
      "createdAt": "2026-03-26T12:00:00.000Z",
      "completedAt": "2026-03-26T12:05:30.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "status": "awaiting_feedback",
      "requirementsSummary": "온라인 예약 시스템...",
      "cloneUrl": null,
      "repoName": null,
      "createdAt": "2026-03-26T10:00:00.000Z",
      "completedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

> `requirementsSummary`는 원본 요구사항의 앞 100자를 잘라 반환한다.

---

#### `GET /generation/:jobId` — 생성 상세 조회

**설명**: 특정 생성 작업의 상세 정보를 조회한다.

**인증 필요**: Bearer Token

**Response 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "completed",
  "requirements": "할 일 목록을 관리할 수 있는 웹 서비스...",
  "developerOptions": {
    "techStack": "Next.js + TypeScript",
    "architecture": "monolith",
    "deployment": "Vercel"
  },
  "progressPercent": 100,
  "cloneUrl": "https://github.com/john-doe/mvp-todo-app-john-doe",
  "repoName": "mvp-todo-app-john-doe",
  "testReport": {
    "passed": 12,
    "failed": 0,
    "total": 12,
    "coverage": 78,
    "summary": "전체 12개 테스트 통과. 커버리지 78%."
  },
  "createdAt": "2026-03-26T12:00:00.000Z",
  "completedAt": "2026-03-26T12:05:30.000Z"
}
```

**에러**:
- `404 GEN_002` — 생성 작업을 찾을 수 없음
- `403` — 다른 사용자의 생성 작업 접근 시도

---

## 5. 엔드포인트 요약표

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/auth/github` | GitHub OAuth 시작 | 불필요 |
| GET | `/auth/github/callback` | GitHub OAuth 콜백 | 불필요 |
| POST | `/auth/logout` | 로그아웃 | Bearer Token |
| GET | `/users/me` | 내 프로필 조회 | Bearer Token |
| POST | `/generation` | MVP 생성 요청 | Bearer Token |
| GET | `/generation/:jobId/stream` | 생성 진행률 SSE | Bearer Token |
| GET | `/generation/:jobId/analysis` | 분석 문서 조회 | Bearer Token |
| POST | `/generation/:jobId/feedback` | 피드백 제출 | Bearer Token |
| GET | `/generation/:jobId/test-report` | 테스트 리포트 조회 | Bearer Token |
| GET | `/generation` | 생성 이력 목록 | Bearer Token |
| GET | `/generation/:jobId` | 생성 상세 조회 | Bearer Token |

---

## 6. 공유 타입 정의 위치

API 요청/응답 타입은 `packages/shared/types/` 디렉터리에서 관리한다 (C-CODE-04).

```
packages/shared/
└── types/
    ├── auth.ts          # AuthTokenResponse 등
    ├── user.ts          # UserProfile 등
    └── generation.ts    # GenerationCreateDto, GenerationResponse, SseEventPayload,
                         # AnalysisDoc, FeedbackDto, TestReport 등
```

Frontend와 Backend 모두 동일 타입을 참조하여 타입 불일치를 방지한다.
