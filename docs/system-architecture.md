# 시스템 아키텍처
# mvp-builder

> 작성일: 2026-03-17 (수정: 2026-03-26)
> 작성자: Architecture Agent (3단계)
> 기반 문서: `docs/constitution.md`, `docs/PRD.md`, `docs/MVP-scope.md`, `docs/tech-stack.md`

---

## 1. 아키텍처 개요

mvp-builder는 다음 세 영역으로 구성된다.

| 영역 | 역할 |
|------|------|
| **Frontend (React SPA)** | 사용자 인터페이스. 요구사항 입력, 분석 문서 표시 및 피드백 제출, 생성 진행 상황 실시간 표시, 이력 조회. |
| **Backend (NestJS API)** | 비즈니스 로직 처리. GitHub OAuth 인증, 생성 요청 큐잉, SSE 스트리밍, GitHub 연동 조율. |
| **외부 서비스** | Claude Agent SDK(AI 생성), GitHub OAuth API(인증), GitHub REST API(repo 생성). |

---

## 2. 컴포넌트 목록

### 2.1 Frontend 컴포넌트

| 컴포넌트 | 역할 | 주요 라이브러리 |
|----------|------|----------------|
| Auth Pages | GitHub OAuth 로그인 버튼, 콜백 처리 | Zustand |
| Generation Form | 요구사항 입력 + 개발자 옵션(Progressive Disclosure) | Zustand, shadcn/ui |
| Analysis Viewer | 분석 문서(ERD, API 설계, 아키텍처) 표시 및 피드백 입력 UI | shadcn/ui, React Hook Form |
| Progress Monitor | SSE 수신 및 단계별 진행률 실시간 표시 | native EventSource |
| Test Report Viewer | 테스트 리포트(통과/실패/커버리지) 표시 | shadcn/ui |
| Result Display | clone URL 표시, 복사 버튼 | shadcn/ui |
| History List | 생성 이력 목록, 상태 필터, clone URL 재확인 | TanStack Query |
| Auth Store | 로그인 상태, Access Token 관리 | Zustand |

### 2.2 Backend 모듈 (NestJS)

| 모듈 | 역할 | 주요 의존성 |
|------|------|-------------|
| `AuthModule` | GitHub OAuth 인증, JWT 발급, 사용자 생성/조회 | @nestjs/jwt, passport-github2, crypto (AES-256) |
| `UserModule` | 사용자 조회, 프로필 관리 | Prisma |
| `GenerationModule` | 생성 요청 접수, BullMQ 큐잉, 생성 이력 저장/조회, 피드백 처리 | BullMQ, Prisma |
| `AgentModule` | Claude Agent SDK 호출, 파이프라인 실행(분석→피드백대기→개발→테스트) | @anthropic-ai/sdk |
| `GithubModule` | 사용자 계정에 repo 생성, 파일 트리 커밋, clone URL 반환 | @octokit/rest |
| `SseModule` | SSE 연결 관리, 이벤트 발행, 연결 해제 처리 | NestJS built-in SSE |
| `PrismaModule` | DB 연결 및 ORM 제공 (전역 모듈) | Prisma Client |

### 2.3 인프라 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| PostgreSQL 16 | 메인 데이터 저장소 (USERS, GENERATIONS) |
| Redis 7 | BullMQ 큐 브로커. |
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
        GITHUB_API["GitHub REST API v3"]
        GITHUB_OAUTH["GitHub OAuth API"]
    end

    FE -->|"REST API (HTTPS)"| API
    FE -->|"SSE (GET /generation/:jobId/stream)"| SSE_MOD
    API --> AUTH
    API --> USER
    API --> GEN
    API --> SSE_MOD

    AUTH -->|"OAuth 인증"| GITHUB_OAUTH

    GEN -->|"enqueue job"| REDIS
    REDIS -->|"dequeue job"| QUEUE
    QUEUE --> AGENT
    QUEUE --> GH_MOD
    QUEUE -->|"SSE 이벤트 발행"| SSE_MOD

    AGENT -->|"API 호출"| CLAUDE
    GH_MOD -->|"사용자 계정 repo 생성 + 파일 커밋"| GITHUB_API

    AUTH --> PG
    USER --> PG
    GEN --> PG
```

### 3.2 생성 파이프라인 시퀀스 (피드백 루프 포함)

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
    Agent-->>BE: 분석 문서 생성 완료 (ERD, API 설계, 아키텍처)
    BE->>BE: analysisDoc DB 저장, status=awaiting_feedback
    BE-->>FE: SSE: event=analysis_ready { percent=20 }

    Note over FE,User: 사용자 분석 문서 검토
    FE->>BE: GET /api/v1/generation/:jobId/analysis
    BE-->>FE: 분석 문서 반환
    FE->>User: 분석 문서 표시 (ERD, API 설계, 아키텍처)

    User->>FE: 피드백 입력 후 승인 또는 수정 요청
    FE->>BE: POST /api/v1/generation/:jobId/feedback
    BE->>Queue: 개발 단계 작업 enqueue
    BE-->>FE: 200 { status: "developing" }
    FE->>BE: SSE 재연결

    Note over Agent: 2단계: 개발 (20~80%)
    Agent-->>BE: 단계 이벤트
    BE-->>FE: SSE: event=progress { stage="developing", percent=60 }

    Note over Agent: 3단계: 테스트 (80~90%)
    Agent-->>BE: 테스트 리포트 생성 완료
    BE->>BE: testReport DB 저장
    BE-->>FE: SSE: event=progress { stage="testing", percent=90 }

    Note over Agent: 4단계: 업로드 (90~99%)
    BE->>GH: 사용자 계정에 repo 생성 (사용자 OAuth token 사용)
    GH-->>BE: repo 생성 완료
    BE->>GH: 파일 전체 커밋
    GH-->>BE: clone URL

    BE->>BE: Generation 레코드 업데이트 (status=completed, cloneUrl)
    BE-->>FE: SSE: event=completed { cloneUrl, testReport }
    FE->>User: 테스트 리포트 + clone URL 표시

    Note over BE,FE: 에러 발생 시
    BE-->>FE: SSE: event=error { message, stage }
    FE->>User: 에러 메시지 표시
```

### 3.3 GitHub OAuth 인증 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend
    participant GH as GitHub OAuth

    User->>FE: "GitHub로 로그인" 클릭
    FE->>BE: GET /api/v1/auth/github
    BE-->>FE: 302 Redirect → GitHub OAuth 페이지

    User->>GH: GitHub 로그인 + 권한 승인
    GH-->>BE: GET /api/v1/auth/github/callback?code=...
    BE->>GH: code → access_token 교환
    GH-->>BE: access_token + user info (id, username, email)

    alt 신규 사용자
        BE->>BE: 사용자 계정 생성 (github_id, github_username, github_access_token 암호화 저장)
    else 기존 사용자
        BE->>BE: github_access_token 갱신
    end

    BE->>BE: JWT accessToken 발급
    BE-->>FE: 302 Redirect (프론트엔드 URL?accessToken=...)
    FE->>FE: accessToken Zustand store에 저장
    FE->>User: 메인 생성 페이지 표시
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

  [analyzing 0~20%]
  → AgentModule: 분석 문서 생성
  → Generation 레코드 업데이트 (status=awaiting_feedback, analysisDoc 저장)
  → SSE analysis_ready 이벤트

  [사용자 검토]
  → FE: GET /api/v1/generation/:jobId/analysis → 분석 문서 표시
  → 사용자 피드백 제출: POST /api/v1/generation/:jobId/feedback
  → BullMQ: 개발 단계 job enqueue
  → Generation 레코드 업데이트 (status=developing, userFeedback 저장)

  [developing 20~80%]
  → AgentModule: 피드백 반영하여 코드 생성
  → SSE progress 이벤트

  [testing 80~90%]
  → AgentModule: 테스트 실행 → 리포트 생성
  → Generation 레코드 업데이트 (testReport 저장)
  → SSE progress 이벤트

  [uploading 90~99%]
  → GithubModule: 사용자 OAuth token으로 repo 생성 + 파일 커밋
  → Generation 레코드 업데이트 (status=completed, cloneUrl, fileTree)
  → SSE completed 이벤트 (cloneUrl, testReport 포함)
  → FE: 테스트 리포트 + clone URL 표시
```

#### 시나리오 2: 생성 이력 조회

```
GET /api/v1/generation (Authorization: Bearer accessToken)
  → AuthGuard: JWT 검증
  → GenerationModule: userId 기준 목록 조회 (최신순)
  → Response: 생성 이력 배열 (id, status, requirements 요약, cloneUrl, createdAt)
```

#### 시나리오 3: 토큰 만료 처리

```
API 호출 → 401 Unauthorized
  → FE TanStack Query: 401 인터셉터 감지
  → GitHub OAuth 재인증 또는 로그인 페이지 리다이렉트
```

---

## 5. 보안 고려사항

### 5.1 인증/인가

| 항목 | 구현 방식 | 근거 |
|------|----------|------|
| 로그인 방식 | GitHub OAuth 2.0. 이메일/비밀번호 미사용. | 개발자 타겟, GitHub 계정 전제 |
| Access Token | JWT. 만료 15분. 메모리(Zustand store)에만 저장. LocalStorage 미사용. | C-SEC-01, C-SEC-02 |
| GitHub OAuth Token | AES-256 암호화 후 DB 저장. 복호화 키는 환경변수. | C-SEC-06, C-SEC-14 |
| 모든 인증 필요 API | NestJS `@UseGuards(JwtAuthGuard)` 데코레이터로 보호. | C-SEC-04 |

### 5.2 민감 데이터 처리

| 데이터 | 처리 방식 | 근거 |
|--------|----------|------|
| Claude API key (MVP) | 서버 환경 변수. 클라이언트 노출 불가. 로그 마스킹. | C-SEC-06, C-SEC-12, C-SEC-14 |
| Claude API key (BYOK, 이후 버전) | 사용자 직접 입력. 세션에만 보관, DB 미저장. 로그 마스킹. | C-SEC-06 |
| GitHub OAuth Token | AES-256 암호화 저장. 복호화는 서버에서만. 로그 마스킹. | C-SEC-06, C-SEC-08 |
| 비밀 정보 (JWT secret 등) | 코드 하드코딩 금지. 프로덕션은 AWS Secrets Manager 사용. | C-SEC-12, C-SEC-13, C-SEC-14 |

### 5.3 입력 검증

- 모든 API: NestJS `ValidationPipe` + `class-validator`로 서버 측 검증 (C-SEC-09)
- 자연어 요구사항: 최대 10,000자 제한 (C-SEC-10)
- 사용자 피드백: 최대 5,000자 제한
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
  "timestamp": "2026-03-26T12:00:00.000Z",
  "path": "/api/v1/generation"
}
```

### 6.2 생성 파이프라인 에러 처리

| 에러 유형 | 처리 방식 |
|----------|----------|
| Claude API 호출 실패 | 최대 3회 재시도(exponential backoff). 전체 실패 시 SSE error 이벤트 발행. Generation 상태 `failed`로 업데이트. |
| GitHub API 호출 실패 | SSE error 이벤트 즉시 발행. Generation 상태 `failed`로 업데이트. |
| awaiting_feedback 상태에서 타임아웃 | 피드백 미제출 24시간 경과 시 Generation 상태 `timeout`으로 업데이트. |
| 타임아웃 초과 (생성 중) | SSE timeout 이벤트 발행. "요구사항을 간소화한 후 재시도해주세요" 메시지 표시. 작업 자동 취소. |
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
