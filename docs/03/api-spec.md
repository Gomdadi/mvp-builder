# API 스펙 — AI 기반 자동화 MVP 빌더

---

## Base URL 및 버전 관리

```
Base URL: https://api.mvpbuilder.io/v1
로컬:     http://localhost:3001/v1
```

버전 관리: URL Path 버전 (`/v1`, `/v2`)

---

## 인증 방식

모든 API는 `Authorization: Bearer <access_token>` 헤더 필수 (공개 엔드포인트 제외).

| 토큰 | TTL | 저장 위치 |
|------|-----|-----------|
| Access Token (JWT) | 15분 | 클라이언트 메모리 |
| Refresh Token (JWT) | 7일 | HttpOnly Cookie |

---

## 엔드포인트 목록

### 인증 (Auth)

#### `GET /v1/auth/github` `[공개]`
GitHub OAuth 로그인 시작

- **Response**: `302 Redirect` → GitHub OAuth 페이지

---

#### `GET /v1/auth/github/callback` `[공개]`
GitHub OAuth 콜백

- **Response**:
```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "uuid",
    "githubLogin": "username",
    "avatarUrl": "https://..."
  }
}
```

---

#### `POST /v1/auth/refresh` `[공개]`
Access Token 재발급

- **Request**: HttpOnly Cookie의 Refresh Token 자동 전송
- **Response**:
```json
{ "accessToken": "eyJ..." }
```

---

#### `DELETE /v1/auth/logout` `[인증 필수]`
로그아웃 (Refresh Token 무효화)

- **Response**: `204 No Content`

---

### 사용자 (Users)

#### `GET /v1/users/me` `[인증 필수]`
내 프로필 조회

- **Response**:
```json
{
  "id": "uuid",
  "githubLogin": "username",
  "avatarUrl": "https://...",
  "hasApiKey": true,
  "createdAt": "2026-04-10T00:00:00Z"
}
```

---

#### `PUT /v1/users/me/api-key` `[인증 필수]`
Claude API Key 등록/수정

- **Request**:
```json
{ "apiKey": "sk-ant-..." }
```
- **Response**: `200 OK`
```json
{ "hasApiKey": true }
```

> 보안: apiKey는 AES-256-GCM 암호화 후 저장. 응답에 복호화된 값 절대 미포함.

---

#### `DELETE /v1/users/me/api-key` `[인증 필수]`
Claude API Key 삭제

- **Response**: `204 No Content`

---

### 프로젝트 (Projects)

#### `POST /v1/projects` `[인증 필수]`
프로젝트 생성

- **Request** (검증 규칙: name 1~200자 필수, requirements 10~10000자 필수, description 선택):
```json
{
  "name": "내 SaaS 프로젝트",
  "description": "구독 기반 콘텐츠 플랫폼",
  "requirements": "사용자가 월정액을 내고 콘텐츠를 구독하는 서비스...",
  "techStack": {
    "frontend": "Next.js",
    "backend": "NestJS",
    "database": "PostgreSQL"
  }
}
```
- **Response**: `201 Created`
```json
{
  "id": "uuid",
  "name": "내 SaaS 프로젝트",
  "status": "CREATED",
  "createdAt": "2026-04-10T00:00:00Z"
}
```

**status 가능 값**: `CREATED` | `ANALYZING` | `AWAITING_REVIEW` | `GENERATING` | `COMPLETED` | `FAILED`

---

#### `GET /v1/projects` `[인증 필수]`
내 프로젝트 목록 조회

- **Response**:
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "내 SaaS 프로젝트",
      "status": "COMPLETED",
      "githubRepoUrl": "https://github.com/user/repo",
      "createdAt": "2026-04-10T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

#### `GET /v1/projects/:id` `[인증 필수]`
프로젝트 상세 조회

- **Response**:
```json
{
  "id": "uuid",
  "name": "내 SaaS 프로젝트",
  "status": "AWAITING_REVIEW",
  "requirements": "...",
  "techStack": { "frontend": "Next.js", "backend": "NestJS", "database": "PostgreSQL" },
  "analysisDoc": {
    "erd": "## ERD\n...",
    "apiSpec": "## API 스펙\n...",
    "architecture": "## 아키텍처\n..."
  },
  "githubRepoUrl": null,
  "createdAt": "2026-04-10T00:00:00Z"
}
```

---

### 파이프라인 (Pipeline)

#### `POST /v1/pipeline/:projectId/start` `[인증 필수]`
Phase 1 시작 (분석 문서 생성)

- **선행 조건**: 사용자 API Key 등록 필수
- **Response**: `202 Accepted`
```json
{
  "pipelineId": "uuid",
  "phase": "PHASE_1",
  "status": "RUNNING"
}
```

---

#### `GET /v1/pipeline/:projectId/stream` `[인증 필수]`
SSE 스트림 구독 (실시간 진행 상황)

- **Response**: `text/event-stream`

이벤트 타입:

| 이벤트 | 데이터 예시 | 설명 |
|--------|------------|------|
| `phase_started` | `{"phase": "PHASE_1", "message": "요구사항 분석 시작"}` | 단계 시작 |
| `progress` | `{"phase": "PHASE_1", "message": "ERD 생성 중...", "percent": 30}` | 진행 중 |
| `phase_completed` | `{"phase": "PHASE_1", "message": "분석 문서 생성 완료"}` | 단계 완료 |
| `task_started` | `{"taskId": "uuid", "taskName": "User 테이블 CRUD API"}` | 태스크 시작 (Phase 3) |
| `task_completed` | `{"taskId": "uuid", "taskName": "User 테이블 CRUD API"}` | 태스크 완료 (Phase 3) |
| `pipeline_completed` | `{"githubRepoUrl": "https://github.com/user/repo"}` | 전체 완료 |
| `pipeline_failed` | `{"error": "Claude API 호출 실패", "phase": "PHASE_1"}` | 실패 |

---

#### `POST /v1/pipeline/:projectId/feedback` `[인증 필수]`
Phase 1 결과에 수정 요청 (Phase 1 재실행)

- **Request**:
```json
{
  "feedback": "결제 기능은 MVP에서 제외해주세요. ERD에서 Payment 테이블 삭제."
}
```
- **Response**: `202 Accepted`
```json
{ "pipelineId": "uuid", "phase": "PHASE_1", "status": "RUNNING" }
```

---

#### `POST /v1/pipeline/:projectId/confirm` `[인증 필수]`
분석 문서 확정 → Phase 2, 3 시작

- **Response**: `202 Accepted`
```json
{ "pipelineId": "uuid", "phase": "PHASE_2", "status": "RUNNING" }
```

---

## 공통 에러 코드

| HTTP 상태 | 에러 코드 | 설명 |
|-----------|-----------|------|
| 400 | `VALIDATION_ERROR` | 요청 본문 유효성 검사 실패 |
| 401 | `UNAUTHORIZED` | 인증 토큰 없음 또는 만료 |
| 403 | `FORBIDDEN` | 다른 사용자의 리소스 접근 시도 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `API_KEY_MISSING` | Claude API Key 미등록 상태에서 파이프라인 시작 시도 |
| 409 | `PIPELINE_ALREADY_RUNNING` | 이미 실행 중인 파이프라인에 중복 시작 요청 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |
| 502 | `CLAUDE_API_ERROR` | Claude API 호출 실패 |
| 502 | `GITHUB_API_ERROR` | GitHub API 호출 실패 |

**에러 응답 형식**:
```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": "requirements 필드는 필수입니다."
}
```
