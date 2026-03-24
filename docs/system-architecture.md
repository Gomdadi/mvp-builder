# 시스템 아키텍처
# mvp-builder

> 작성일: 2026-03-17
> 작성자: Architecture Agent (3단계)
> 기반 문서: `docs/constitution.md`, `docs/PRD.md`, `docs/MVP-scope.md`, `docs/tech-stack.md`

---

## 1. 아키텍처 개요

mvp-builder는 다음 세 영역으로 구성된다.

| 영역 | 역할 |
|------|------|
| **Frontend (React SPA)** | 사용자 인터페이스. 요구사항 입력, 생성 진행 상황 실시간 표시, 이력 조회. |
| **Backend (NestJS API)** | 비즈니스 로직 처리. 인증, 생성 요청 큐잉, SSE 스트리밍, GitHub 연동 조율. |
| **외부 서비스** | Claude Agent SDK(AI 생성), GitHub API(repo 생성), Gmail SMTP(이메일 인증). |

---

## 2. 컴포넌트 목록

### 2.1 Frontend 컴포넌트

| 컴포넌트 | 역할 | 주요 라이브러리 |
|----------|------|----------------|
| Auth Pages | 회원가입, 로그인, 이메일 인증 완료 페이지 | React Hook Form, zod |
| Generation Form | 요구사항 입력 + 개발자 옵션(Progressive Disclosure) | Zustand, shadcn/ui |
| Progress Monitor | SSE 수신 및 단계별 진행률 실시간 표시 | native EventSource |
| Result Display | clone URL 표시, 복사 버튼 | shadcn/ui |
| History List | 생성 이력 목록, 상태 필터, clone URL 재확인 | TanStack Query |
| Auth Store | 로그인 상태, Access Token 관리 | Zustand |

### 2.2 Backend 모듈 (NestJS)

| 모듈 | 역할 | 주요 의존성 |
|------|------|-------------|
| `AuthModule` | 회원가입, 로그인, 이메일 인증, JWT 발급, Refresh Token rotation | @nestjs/jwt, bcrypt, Nodemailer |
| `UserModule` | 사용자 조회, 프로필 관리 | Prisma |
| `GenerationModule` | 생성 요청 접수, BullMQ 큐잉, 생성 이력 저장/조회 | BullMQ, Prisma |
| `AgentModule` | Claude Agent SDK 호출, 파이프라인 실행(분석→문서화→개발→테스트) | @anthropic-ai/sdk |
| `GithubModule` | GitHub repo 생성, 파일 트리 커밋, clone URL 반환 | @octokit/rest |
| `SseModule` | SSE 연결 관리, 이벤트 발행, 연결 해제 처리 | NestJS built-in SSE |
| `PrismaModule` | DB 연결 및 ORM 제공 (전역 모듈) | Prisma Client |

### 2.3 인프라 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| PostgreSQL 16 | 메인 데이터 저장소 (USER, GENERATION, REFRESH_TOKEN) |
| Redis 7 | BullMQ 큐 브로커. Refresh Token 블랙리스트 처리 옵션. |
| BullMQ | 생성 작업 큐 관리. 사용자당 동시 1건 제한. 재시도(최대 3회, exponential backoff). |
| AWS EC2 | 컨테이너 호스팅 (초기 구성) |
| AWS CloudWatch Logs | 구조화된 JSON 로그 수집 |

---

## 3. 아키텍처 다이어그램

### 3.1 전체 시스템 컴포넌트

```mermaid
graph TD
    subgraph Client["Client (Browser)"]
        FE["React SPA<br/>(Vite + TypeScript)"]
    end

    subgraph Backend["Backend (AWS EC2 + Docker)"]
        API["NestJS API Server"]
        subgraph Modules["NestJS Modules"]
            AUTH["AuthModule"]
            USER["UserModule"]
            GEN["GenerationModule"]
            AGENT["AgentModule"]
            GH_MOD["GithubModule"]
            SSE_MOD["SseModule"]
        end
        QUEUE["BullMQ Worker"]
    end

    subgraph DataLayer["Data Layer"]
        PG["PostgreSQL 16"]
        REDIS["Redis 7"]
    end

    subgraph ExternalServices["External Services"]
        CLAUDE["Claude Agent SDK<br/>(Anthropic)"]
        GITHUB["GitHub REST API v3"]
        GMAIL["Gmail SMTP"]
    end

    FE -->|"REST API (HTTPS)"| API
    FE -->|"SSE (GET /generation/:jobId/stream)"| SSE_MOD
    API --> AUTH
    API --> USER
    API --> GEN
    API --> SSE_MOD

    GEN -->|"enqueue job"| REDIS
    REDIS -->|"dequeue job"| QUEUE
    QUEUE --> AGENT
    QUEUE --> GH_MOD
    QUEUE -->|"SSE 이벤트 발행"| SSE_MOD

    AGENT -->|"API 호출"| CLAUDE
    GH_MOD -->|"repo 생성 + 파일 커밋"| GITHUB
    AUTH -->|"인증 메일 발송"| GMAIL

    AUTH --> PG
    USER --> PG
    GEN --> PG
    AUTH --> REDIS
```

### 3.2 생성 파이프라인 시퀀스

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant BE as Backend (NestJS)
    participant Queue as BullMQ + Redis
    participant Agent as Claude Agent SDK
    participant GH as GitHub API

    User->>FE: 요구사항 입력 (+ 선택 옵션)
    FE->>BE: POST /api/v1/generation
    BE->>BE: 진행 중인 생성 작업 여부 확인
    BE->>Queue: 생성 작업 enqueue
    BE-->>FE: 201 { jobId }
    FE->>BE: GET /api/v1/generation/:jobId/stream (SSE 연결)
    BE-->>FE: SSE: event=connected

    Queue->>Agent: 작업 시작
    Note over Agent: 1단계: 분석 (0~20%)
    Agent-->>BE: 단계 이벤트
    BE-->>FE: SSE: event=progress { stage="analyzing", percent=10 }

    Note over Agent: 2단계: 문서화 (20~40%)
    Agent-->>BE: 단계 이벤트
    BE-->>FE: SSE: event=progress { stage="documenting", percent=30 }

    Note over Agent: 3단계: 개발 (40~80%)
    Agent-->>BE: 단계 이벤트
    BE-->>FE: SSE: event=progress { stage="developing", percent=60 }

    Note over Agent: 4단계: 테스트 (80~100%)
    Agent-->>BE: 생성 완료 (파일 트리 + 코드)
    BE-->>FE: SSE: event=progress { stage="testing", percent=90 }

    BE->>GH: repo 생성 (mvp-{keyword}-{username})
    GH-->>BE: repo 생성 완료
    BE->>GH: 파일 전체 커밋
    GH-->>BE: clone URL

    BE->>BE: Generation 레코드 업데이트 (status=completed, cloneUrl)
    BE-->>FE: SSE: event=completed { cloneUrl }
    FE->>User: clone URL 표시 + 복사 버튼

    Note over BE,FE: 에러 발생 시
    BE-->>FE: SSE: event=error { message, stage }
    FE->>User: 에러 메시지 표시
```

### 3.3 인증 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant DB as PostgreSQL
    participant Mail as Gmail SMTP

    Note over User,Mail: 회원가입
    User->>FE: 이메일 + 비밀번호 입력
    FE->>BE: POST /api/v1/auth/register
    BE->>DB: 사용자 생성 (isEmailVerified=false)
    BE->>Mail: 인증 메일 발송 (token 포함)
    BE-->>FE: 201 { message: "인증 메일을 확인하세요" }

    User->>BE: GET /api/v1/auth/verify-email?token=...
    BE->>DB: isEmailVerified=true 업데이트
    BE-->>FE: 302 리다이렉트 (로그인 페이지)

    Note over User,Mail: 로그인
    User->>FE: 이메일 + 비밀번호
    FE->>BE: POST /api/v1/auth/login
    BE->>DB: 사용자 조회 + bcrypt 검증
    BE->>DB: Refresh Token 저장
    BE-->>FE: 200 { accessToken, refreshToken }
    FE->>FE: accessToken 메모리 저장, refreshToken 쿠키 저장

    Note over User,Mail: 토큰 갱신
    FE->>BE: POST /api/v1/auth/refresh (refreshToken 쿠키)
    BE->>DB: Refresh Token 검증 + 무효화
    BE->>DB: 새 Refresh Token 저장 (Rotation)
    BE-->>FE: 200 { accessToken, refreshToken }
```

---

## 4. 데이터 흐름

### 4.1 핵심 시나리오별 데이터 흐름

#### 시나리오 1: MVP 생성 (정상 경로)

```
사용자 요구사항 입력
  → FE Zustand store에 임시 저장
  → POST /api/v1/generation (requirements, developerOptions?)
  → GenerationModule: Generation 레코드 생성 (status=pending)
  → BullMQ: job enqueue (jobId = generationId)
  → FE: SSE 연결 (/api/v1/generation/:jobId/stream)
  → AgentModule: Claude SDK 호출 (4단계 파이프라인)
  → SSE 이벤트 발행 (progress 0~100%)
  → GithubModule: repo 생성 + 파일 커밋
  → Generation 레코드 업데이트 (status=completed, cloneUrl, fileTree)
  → SSE completed 이벤트
  → FE: clone URL 표시
```

#### 시나리오 2: 생성 이력 조회

```
GET /api/v1/generation (Authorization: Bearer accessToken)
  → AuthGuard: JWT 검증
  → GenerationModule: userId 기준 목록 조회 (최신순)
  → Response: 생성 이력 배열 (id, status, requirements 요약, cloneUrl, createdAt)
```

#### 시나리오 3: 토큰 만료 처리 (FE 자동 갱신)

```
API 호출 → 401 Unauthorized
  → FE TanStack Query: 401 인터셉터 감지
  → POST /api/v1/auth/refresh
  → 성공: 새 accessToken으로 원래 요청 재시도
  → 실패: 로그인 페이지 리다이렉트
```

---

## 5. 보안 고려사항

### 5.1 인증/인가

| 항목 | 구현 방식 | 근거 |
|------|----------|------|
| Access Token | JWT. 만료 15분. 메모리(Zustand store)에만 저장. LocalStorage 미사용. | C-SEC-01, C-SEC-02 |
| Refresh Token | httpOnly + Secure 쿠키로 전달. DB 저장. 7일 만료. Rotation 적용. | C-SEC-01, C-SEC-03 |
| 이메일 인증 미완료 계정 | 로그인 시 `403 Forbidden` 반환. 인증 메일 재발송 옵션 제공. | C-SEC-01 |
| 모든 인증 필요 API | NestJS `@UseGuards(JwtAuthGuard)` 데코레이터로 보호. | C-SEC-04 |
| 비밀번호 | bcrypt(salt rounds: 12) 해싱. 평문 저장 및 응답 포함 금지. | C-SEC-05 |

### 5.2 민감 데이터 처리

| 데이터 | 처리 방식 | 근거 |
|--------|----------|------|
| Claude API key | 서버 환경 변수. 클라이언트 노출 불가. 로그 마스킹. | C-SEC-06, C-SEC-12, C-SEC-14 |
| GitHub token | 서버 환경 변수(운영자 소유). 클라이언트 노출 불가. 로그 마스킹. DB 미저장. | C-SEC-06, C-SEC-08, C-SEC-12, C-SEC-14 |
| 사용자 비밀번호 | bcrypt 해싱 저장. API 응답에서 제외(DTO 명시 제외). | C-SEC-05, C-SEC-07 |
| Refresh Token | DB 저장 시 SHA-256 해시값으로 저장. 검증 시 쿠키 값을 해싱해서 비교. 유출 시 즉시 무효화 가능(Rotation). | C-SEC-03 |
| 비밀 정보 (JWT secret 등) | 코드 하드코딩 금지. 프로덕션은 AWS Secrets Manager 사용. | C-SEC-12, C-SEC-13, C-SEC-14 |

### 5.3 입력 검증

- 모든 API: NestJS `ValidationPipe` + `class-validator`로 서버 측 검증 (C-SEC-09)
- 자연어 요구사항: 최대 10,000자 제한 (C-SEC-10)
- 생성된 코드: 서버에서 실행하지 않음 (C-SEC-11)

### 5.4 CORS 및 전송 보안

- 프로덕션: HTTPS 강제 적용 (C-SEC-12 환경 분리 원칙 적용)
- CORS: FE 도메인만 허용 (wildcard `*` 금지) (C-SEC-04 인가 원칙 적용)
- SSE 엔드포인트: 인증된 사용자의 자신의 jobId에만 접근 허용 (C-SEC-04)
- Rate Limiting: 초기 MVP 미적용 (C-SEC-15)

---

## 6. 에러 처리 전략

### 6.1 표준 에러 응답 형식 (C-CODE-14)

```json
{
  "statusCode": 400,
  "message": "요구사항은 최대 10,000자까지 입력 가능합니다.",
  "error": "Bad Request",
  "timestamp": "2026-03-17T12:00:00.000Z",
  "path": "/api/v1/generation"
}
```

### 6.2 생성 파이프라인 에러 처리

| 에러 유형 | 처리 방식 |
|----------|----------|
| Claude API 호출 실패 | 최대 3회 재시도(exponential backoff). 전체 실패 시 SSE error 이벤트 발행. Generation 상태 `failed`로 업데이트. |
| GitHub API 호출 실패 | SSE error 이벤트 즉시 발행(C-CODE-16). Generation 상태 `failed`로 업데이트. |
| 타임아웃 초과 | SSE timeout 이벤트 발행. "요구사항을 간소화한 후 재시도해주세요" 메시지 표시. 작업 자동 취소. |
| 사용자 이미 생성 중 | `409 Conflict` 반환. 진행 중인 생성의 jobId 포함. |

---

## 7. 배포 아키텍처

```mermaid
graph TD
    subgraph AWS["AWS (Production)"]
        subgraph EC2["EC2 Instance"]
            DC["docker-compose"]
            subgraph Containers["Containers"]
                BE_C["backend container<br/>(NestJS, Port 3000)"]
                FE_C["frontend container<br/>(React+Nginx, Port 80/443)"]
            end
        end
        RDS["RDS PostgreSQL 16"]
        EC_REDIS["ElastiCache Redis 7"]
        CW["CloudWatch Logs"]
        SM["Secrets Manager"]
    end

    subgraph CI_CD["CI/CD (GitHub Actions)"]
        PR_CHECK["PR: lint + test"]
        DEPLOY["main push: build + deploy"]
    end

    Internet -->|"HTTPS"| FE_C
    FE_C -->|"API"| BE_C
    BE_C --> RDS
    BE_C --> EC_REDIS
    BE_C -->|"logs"| CW
    BE_C -->|"env vars"| SM

    DEPLOY -->|"SSH + docker pull"| EC2
```

### 7.1 로컬 개발 환경 (docker-compose)

```
docker-compose up
  → backend    (NestJS, :3000)
  → frontend   (Vite dev server, :5173)
  → postgres   (PostgreSQL 16, :5432)
  → redis      (Redis 7, :6379)
```
