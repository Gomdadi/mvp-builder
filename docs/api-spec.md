# API 스펙
# mvp-builder

> 작성일: 2026-03-17
> 작성자: Architecture Agent (3단계)
> 기반 문서: `docs/PRD.md`, `docs/MVP-scope.md`, `docs/tech-stack.md`, `docs/system-architecture.md`
> MVP In-scope 기능(F-01~F-08)만 설계한다.

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

### 2.1 JWT Bearer Token

- 인증이 필요한 모든 엔드포인트는 `Authorization` 헤더에 Access Token을 포함한다.
- Access Token 만료 시간: **15분**
- Refresh Token 만료 시간: **7일** (httpOnly 쿠키로 전달)

```
Authorization: Bearer <accessToken>
```

### 2.2 Refresh Token Rotation

- `POST /auth/refresh` 호출 시 기존 Refresh Token을 무효화하고 새 토큰 쌍을 발급한다.
- Refresh Token은 `Set-Cookie` 헤더로 응답한다 (`httpOnly`, `Secure`, `SameSite=Strict`).

### 2.3 토큰 갱신 흐름

```
API 호출 → 401 응답
  → POST /api/v1/auth/refresh (refreshToken 쿠키 자동 포함)
  → 200: 새 accessToken + refreshToken 발급 → 원래 요청 재시도
  → 401: 로그인 페이지로 리다이렉트
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
| 403 | Forbidden | 권한 없음 (이메일 미인증, 타인 리소스 접근 등) |
| 404 | Not Found | 리소스를 찾을 수 없음 |
| 409 | Conflict | 중복 리소스 (이메일 중복, 생성 작업 중복) |
| 422 | Unprocessable Entity | 비즈니스 로직 검증 실패 |
| 429 | Too Many Requests | Rate Limiting 초과 (MVP 초기 미적용, 예약) |
| 500 | Internal Server Error | 서버 내부 오류 |

### 3.2 에러 응답 형식

```json
{
  "statusCode": 400,
  "message": "요구사항은 최대 10,000자까지 입력 가능합니다.",
  "error": "Bad Request",
  "timestamp": "2026-03-17T12:00:00.000Z",
  "path": "/api/v1/generation"
}
```

### 3.3 도메인별 에러 코드

| 코드 | 메시지 | HTTP 상태 |
|------|--------|-----------|
| `AUTH_001` | 이메일 또는 비밀번호가 올바르지 않습니다. | 401 |
| `AUTH_002` | 이메일 인증이 완료되지 않은 계정입니다. | 403 |
| `AUTH_003` | 만료되거나 유효하지 않은 토큰입니다. | 401 |
| `AUTH_004` | 이미 사용된 Refresh Token입니다. | 401 |
| `USER_001` | 이미 사용 중인 이메일입니다. | 409 |
| `USER_002` | 이미 사용 중인 username입니다. | 409 |
| `GEN_001` | 이미 생성 작업이 진행 중입니다. | 409 |
| `GEN_002` | 생성 작업을 찾을 수 없습니다. | 404 |
| `GEN_003` | 요구사항은 최대 10,000자까지 입력 가능합니다. | 400 |
| `GEN_004` | 생성 작업이 타임아웃되었습니다. 요구사항을 간소화한 후 재시도해주세요. | 422 |
| `GEN_005` | Claude API 호출 또는 생성 파이프라인 내부 오류가 발생했습니다. | 500 |
| `EMAIL_001` | 유효하지 않거나 만료된 이메일 인증 토큰입니다. | 400 |

---

## 4. 엔드포인트 목록

### 4.1 인증 (Auth)

---

#### `POST /auth/register` — 회원가입

**설명**: 이메일 + 비밀번호 + username으로 회원가입. 완료 후 인증 메일 발송.

**인증 필요**: 없음

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "Str0ng!Pass",
  "username": "john-doe"
}
```

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| email | string | O | 유효한 이메일 형식 |
| password | string | O | 최소 8자, 영문 대/소문자 + 숫자 + 특수문자 각 1개 이상 |
| username | string | O | 3~30자, 영문/숫자/하이픈만 허용, 첫 글자 영문 |

**Response 201**

```json
{
  "message": "인증 메일을 발송했습니다. 이메일을 확인해주세요.",
  "email": "user@example.com"
}
```

**에러**
- `400` — 유효성 검사 실패
- `409 USER_001` — 이메일 중복
- `409 USER_002` — username 중복

---

#### `GET /auth/verify-email` — 이메일 인증

**설명**: 인증 메일의 링크 클릭 시 호출. 토큰 검증 후 계정 활성화.

**인증 필요**: 없음

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| token | string | O | 인증 메일에 포함된 UUID 토큰 |

**Response 200**

```json
{
  "message": "이메일 인증이 완료되었습니다. 로그인해주세요."
}
```

**에러**
- `400 EMAIL_001` — 유효하지 않거나 만료된 토큰

---

#### `POST /auth/login` — 로그인

**설명**: 이메일 + 비밀번호 로그인. Access Token + Refresh Token 발급.

**인증 필요**: 없음

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "Str0ng!Pass"
}
```

**Response 200**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "john-doe"
  }
}
```

Set-Cookie 헤더:
```
Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800
```

**에러**
- `401 AUTH_001` — 이메일/비밀번호 불일치
- `403 AUTH_002` — 이메일 미인증

---

#### `POST /auth/refresh` — Access Token 갱신

**설명**: Refresh Token으로 새 Access Token + Refresh Token 발급 (Rotation).

**인증 필요**: 없음 (Refresh Token 쿠키 필요)

**Request**: Cookie에 `refreshToken` 자동 포함

**Response 200**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Set-Cookie 헤더:
```
Set-Cookie: refreshToken=<newToken>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800
```

**에러**
- `401 AUTH_003` — 만료/유효하지 않은 Refresh Token
- `401 AUTH_004` — 이미 사용된 Refresh Token (재사용 감지)

---

#### `POST /auth/logout` — 로그아웃

**설명**: Refresh Token 무효화 및 쿠키 삭제.

**인증 필요**: Bearer Token

**Request**: 바디 없음

**Response 204**: 바디 없음

Set-Cookie 헤더:
```
Set-Cookie: refreshToken=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=0
```

---

#### `POST /auth/resend-verification` — 인증 메일 재발송

**설명**: 인증 메일 미확인 사용자에게 인증 메일 재발송.

**인증 필요**: 없음

**Request Body**

```json
{
  "email": "user@example.com"
}
```

**Response 200**

```json
{
  "message": "인증 메일을 재발송했습니다."
}
```

> 가정: 재발송 요청 시 기존 미사용 토큰을 무효화하고 새 토큰을 발급한다. 남용 방지를 위해 1분 내 재요청 시 동일 응답(200)을 반환하되 실제 발송은 skip한다.

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
  "email": "user@example.com",
  "username": "john-doe",
  "createdAt": "2026-03-17T12:00:00.000Z"
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
  "requirements": "할 일 목록을 관리할 수 있는 웹 서비스. 할 일 추가, 완료 처리, 삭제 기능이 필요하고 로그인 없이도 사용할 수 있어야 해요.",
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
| developerOptions.techStack | string | X | 최대 200자. 자유 입력 또는 선택지 |
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

**에러**
- `400 GEN_003` — 요구사항 길이 초과
- `409 GEN_001` — 이미 진행 중인 생성 작업 존재 (`{ jobId: "<기존 jobId>" }` 포함)

---

#### `GET /generation/:jobId/stream` — 생성 진행률 SSE 스트림

**설명**: SSE(Server-Sent Events)로 생성 진행 상황을 실시간 수신한다.

**인증 필요**: Bearer Token (Authorization 헤더 또는 Query Parameter `token`)

> 가정: 브라우저 `EventSource`는 커스텀 헤더를 지원하지 않으므로 `?token=<accessToken>` Query Parameter 방식을 병행 지원한다.

**Path Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| jobId | string (UUID) | 생성 작업 ID |

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

```
event: progress
data: {"stage":"documenting","stageLabel":"문서화 중","percent":30,"message":"프로젝트 구조를 설계하고 있습니다."}
```

```
event: progress
data: {"stage":"developing","stageLabel":"코드 생성 중","percent":65,"message":"파일을 생성하고 있습니다."}
```

```
event: progress
data: {"stage":"testing","stageLabel":"테스트 생성 중","percent":85,"message":"테스트 코드를 작성하고 있습니다."}
```

```
event: progress
data: {"stage":"uploading","stageLabel":"GitHub 업로드 중","percent":95,"message":"GitHub 저장소에 업로드하고 있습니다."}
```

completed 이벤트 (완료):
```
event: completed
data: {"jobId":"550e8400-e29b-41d4-a716-446655440001","cloneUrl":"https://github.com/mvp-builder/mvp-todo-app-john-doe","repoName":"mvp-todo-app-john-doe","percent":100}
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
| `analyzing` | 요구사항 분석 | 0~20% |
| `documenting` | 프로젝트 구조 설계 및 문서화 | 20~40% |
| `developing` | 코드 파일 생성 | 40~80% |
| `testing` | 테스트 코드 생성 | 80~90% |
| `uploading` | GitHub repo 생성 및 파일 업로드 | 90~99% |

**에러**
- `404 GEN_002` — jobId에 해당하는 생성 작업 없음
- `403` — 다른 사용자의 jobId 접근 시도

---

#### `GET /generation` — 생성 이력 목록 조회

**설명**: 로그인한 사용자의 생성 이력을 최신순으로 조회한다.

**인증 필요**: Bearer Token

**Query Parameters**

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|----------|------|------|--------|------|
| page | number | X | 1 | 페이지 번호 |
| limit | number | X | 20 | 페이지당 항목 수 (최대 50) |
| status | string | X | 없음 | `pending` \| `processing` \| `completed` \| `failed` \| `timeout` 필터 |

**Response 200**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "status": "completed",
      "requirementsSummary": "할 일 목록을 관리할 수 있는 웹 서비스...",
      "cloneUrl": "https://github.com/mvp-builder/mvp-todo-app-john-doe",
      "repoName": "mvp-todo-app-john-doe",
      "createdAt": "2026-03-17T12:00:00.000Z",
      "completedAt": "2026-03-17T12:03:30.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "status": "failed",
      "requirementsSummary": "온라인 예약 시스템...",
      "cloneUrl": null,
      "repoName": null,
      "createdAt": "2026-03-17T10:00:00.000Z",
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

> `data[].status` 가능 값: `pending` | `processing` | `completed` | `failed` | `timeout` (ERD `generations.status` CONSTRAINT와 동일)

> 가정: `requirementsSummary`는 원본 요구사항의 앞 100자를 잘라 반환한다.

---

#### `GET /generation/:jobId` — 생성 상세 조회

**설명**: 특정 생성 작업의 상세 정보를 조회한다. 완료된 경우 clone URL 재확인에 사용.

**인증 필요**: Bearer Token

**Path Parameters**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| jobId | string (UUID) | 생성 작업 ID |

**Response 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "completed",
  "requirements": "할 일 목록을 관리할 수 있는 웹 서비스. 할 일 추가, 완료 처리, 삭제 기능이 필요하고 로그인 없이도 사용할 수 있어야 해요.",
  "developerOptions": {
    "techStack": "Next.js + TypeScript",
    "architecture": "monolith",
    "deployment": "Vercel"
  },
  "progressPercent": 100,
  "cloneUrl": "https://github.com/mvp-builder/mvp-todo-app-john-doe",
  "repoName": "mvp-todo-app-john-doe",
  "createdAt": "2026-03-17T12:00:00.000Z",
  "completedAt": "2026-03-17T12:03:30.000Z"
}
```

**에러**
- `404 GEN_002` — 생성 작업을 찾을 수 없음
- `403` — 다른 사용자의 생성 작업 접근 시도

---

## 5. 엔드포인트 요약표

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/auth/register` | 회원가입 | 불필요 |
| GET | `/auth/verify-email` | 이메일 인증 | 불필요 |
| POST | `/auth/login` | 로그인 | 불필요 |
| POST | `/auth/refresh` | Access Token 갱신 | 불필요 (쿠키) |
| POST | `/auth/logout` | 로그아웃 | Bearer Token |
| POST | `/auth/resend-verification` | 인증 메일 재발송 | 불필요 |
| GET | `/users/me` | 내 프로필 조회 | Bearer Token |
| POST | `/generation` | MVP 생성 요청 | Bearer Token |
| GET | `/generation/:jobId/stream` | 생성 진행률 SSE | Bearer Token |
| GET | `/generation` | 생성 이력 목록 | Bearer Token |
| GET | `/generation/:jobId` | 생성 상세 조회 | Bearer Token |

---

## 6. 공유 타입 정의 위치

API 요청/응답 타입은 `packages/shared/types/` 디렉터리에서 관리한다 (C-CODE-04).

```
packages/shared/
└── types/
    ├── auth.ts          # AuthRegisterDto, AuthLoginDto, AuthTokenResponse 등
    ├── user.ts          # UserProfile 등
    └── generation.ts    # GenerationCreateDto, GenerationResponse, SseEventPayload 등
```

Frontend와 Backend 모두 동일 타입을 참조하여 타입 불일치를 방지한다.
