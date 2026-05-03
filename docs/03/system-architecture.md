# 시스템 아키텍처 — AI 기반 자동화 MVP 빌더

---

## 컴포넌트 목록

| 컴포넌트 | 역할 |
|----------|------|
| **Next.js Frontend** | 사용자 UI, 요구사항 입력, 분석 문서 검토, SSE 수신 및 진행 상황 표시 |
| **NestJS API Server** | 비즈니스 로직, 인증(GitHub OAuth + JWT), 파이프라인 오케스트레이션 |
| **Pipeline Service** | 분석 문서 생성 → 태스크 분해 → 코드 생성 단계를 순서대로 실행 |
| **Claude Agent Service** | `@anthropic-ai/sdk`를 래핑하여 AI 호출 담당. tool use로 에이전트·스킬을 코드로 직접 정의하고 오케스트레이션 |
| **GitHub Service** | GitHub OAuth 토큰 관리, 저장소 생성, 코드 push |
| **BullMQ Queue** | 파이프라인 잡 등록 및 상태 관리. Redis를 저장소로 사용 |
| **Pipeline Worker** | BullMQ Consumer. 큐에서 잡을 꺼내 Pipeline Service 실행. retry·실패 복구 담당 |
| **PostgreSQL** | 사용자, 프로젝트, 파이프라인 단계, 분석 문서, 태스크 status, 생성 파일 S3 경로, GitHub Access Token(AES 암호화) 저장 |
| **Redis** | JWT Refresh Token 저장, GitHub Access Token 단기 캐시 (TTL 설정, 원본은 PostgreSQL) |
| **AWS S3** | 생성된 코드 파일 원본 저장. path(S3 key)만 PostgreSQL에 참조 |

---

## 아키텍처 다이어그램

```mermaid
graph TD
    User["👤 사용자 (브라우저)"]

    subgraph Frontend ["Next.js Frontend"]
        UI["UI Components"]
        SSEClient["EventSource (SSE 수신)"]
    end

    subgraph Backend ["NestJS API Server"]
        AuthModule["Auth Module\n(GitHub OAuth + JWT)"]
        ProjectModule["Project Module\n(프로젝트 CRUD)"]
        PipelineModule["Pipeline Module\n(오케스트레이션)"]
        SSEGateway["SSE Gateway\n(진행 상황 스트리밍)"]

        subgraph Queue ["BullMQ"]
            BullQueue["Pipeline Queue\n(잡 등록)"]
            BullWorker["Pipeline Worker\n(잡 소비·retry)"]
        end

        subgraph Services ["Core Services"]
            PipelineService["Pipeline Service\n(단계 순서 제어)"]
            ClaudeService["Claude Agent Service\n(AI 호출 래퍼)"]
            GitHubService["GitHub Service\n(저장소 생성·push)"]
        end
    end

    subgraph Storage ["Storage"]
        PostgreSQL[("PostgreSQL\n사용자·프로젝트·문서·태스크status·S3경로")]
        Redis[("Redis\nToken 캐시")]
        S3[("AWS S3\n생성 코드 파일")]
    end

    subgraph External ["외부 서비스"]
        ClaudeAPI["Anthropic Claude API\n(사용자 API Key 사용)"]
        GitHubAPI["GitHub API\n(OAuth·저장소·push)"]
    end

    User -->|"HTTP 요청"| UI
    User -->|"SSE 연결"| SSEClient
    UI -->|"REST API"| AuthModule
    UI -->|"REST API"| ProjectModule
    UI -->|"REST API"| PipelineModule
    SSEClient -->|"GET /pipeline/:id/stream"| SSEGateway

    PipelineModule -->|"잡 등록 (202 즉시 응답)"| BullQueue
    BullQueue -->|"Redis에 잡 저장"| Redis
    BullQueue -->|"잡 소비"| BullWorker
    BullWorker --> PipelineService
    PipelineService --> ClaudeService
    PipelineService --> GitHubService
    PipelineService -->|"단계 진행 이벤트"| SSEGateway

    ClaudeService -->|"사용자 API Key"| ClaudeAPI
    GitHubService -->|"사용자 OAuth Token"| GitHubAPI

    AuthModule --> PostgreSQL
    AuthModule --> Redis
    ProjectModule --> PostgreSQL
    PipelineService --> PostgreSQL
    PipelineService -->|"생성 코드 업로드"| S3
    GitHubService -->|"코드 다운로드"| S3
```

---

## 파이프라인 데이터 흐름

### Phase 1: 분석 문서 생성

```
사용자 입력 (요구사항 + 기술 스택)
    → POST /projects (프로젝트 생성, DB 저장)
    → POST /pipeline/:id/start
    → PipelineService: PHASE_1 시작
    → ClaudeService: 요구사항 분석 → ERD/API 스펙/아키텍처 생성 (스트리밍)
    → ClaudeService: 기술 스택에 맞는 디렉토리 구조 확정 (파일 경로 목록 JSON)
    → SSEGateway: 생성 진행 이벤트 → 클라이언트 실시간 노출
    → 완료: 분석 문서 + 디렉토리 구조 DB 저장, 사용자에게 검토 요청
```

### Phase 2: 사용자 확인 및 태스크 분해

```
사용자: 문서 검토 → 수정 요청 또는 확정
    → PATCH /pipeline/:id/feedback (수정 요청 시 Phase 1 재실행)
    → POST /pipeline/:id/confirm (확정 시)
    → PipelineService: PHASE_2 시작
    → ClaudeService: 확정 문서 기반 태스크 분해
    → 태스크 목록 DB 저장
```

### Phase 3: TDD 기반 코드 생성 및 GitHub 업로드

```
    → POST /pipeline/:id/confirm (Phase 2 완료 시)
    → PipelineModule: BullMQ에 PHASE_3 잡 등록 → 202 즉시 응답
    → Pipeline Worker: 잡 소비 → PipelineService: PHASE_3 시작 (태스크 순서 반복)
    → 각 태스크:
        0. DB에서 태스크 status 조회 → status=done이면 skip (resume 지점)
        1. DB에서 Phase 1 확정 디렉토리 구조 조회
        2. ClaudeService: 파일 경로 + 역할 + 의존성을 프롬프트에 주입
           → 테스트 코드 생성 (@anthropic-ai/sdk tool use)
           → 구현 코드 생성
           → 리팩터링
        3. 생성된 코드 S3 업로드 (generated/{projectId}/{path})
           S3 key만 PostgreSQL에 저장
        4. DB에 태스크 status=done 저장
        5. SSEGateway: 태스크 완료 이벤트 전송
    → 전체 코드베이스 완성
    → GitHubService: S3에서 코드 읽어 사용자 저장소 생성 + push
    → SSEGateway: 완료 이벤트 + 저장소 URL 전송
```

---

## 보안 고려사항

| 항목 | 구현 방식 |
|------|-----------|
| **C-SEC-01** 인증/인가 | GitHub OAuth → JWT (Access 15분, Refresh 7일). 모든 API 엔드포인트 JWT 검증 필수 |
| **C-SEC-02** Claude API Key | AES-256-GCM 암호화 후 PostgreSQL 저장. 복호화는 서버 내부에서만 수행 |
| **C-SEC-02** GitHub Access Token | AES-256-GCM 암호화 후 PostgreSQL 저장(영속). Redis는 단기 캐시 용도(TTL)로만 사용. 재시작 후 Redis miss 시 DB에서 복호화하여 재캐시 |
| **C-SEC-03** 입력 검증 | NestJS DTO + class-validator로 모든 요청 서버 측 검증 |
| **C-SEC-03** 코드 실행 격리 | 생성된 코드는 사용자 GitHub로만 전달. 플랫폼 서버에서 실행하지 않음 |
| **C-SEC-04** 비밀 정보 | .env 파일 Git 제외, 운영 환경은 AWS Secrets Manager |
