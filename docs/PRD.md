# PRD — Product Requirements Document
# mvp-builder

> 작성일: 2026-03-17 (수정: 2026-03-26)
> 작성자: PM Agent (1단계)
> 기반 원칙: `docs/constitution.md`

---

## 1. 제품 개요

### 한 줄 요약

자연어 요구사항으로 분석 문서를 먼저 확인하고, 피드백 반영 후 즉시 실행 가능한 MVP를 사용자 GitHub 저장소로 자동 생성해주는 개발자용 서비스.

### 존재 이유

빠른 프로토타이핑이 필요한 개발자가 초기 코드베이스 구축에 드는 반복적인 설정 비용(보일러플레이트, 테스트 세팅, CI/CD 등)을 제거하고, AI가 요구사항을 어떻게 해석했는지 검토한 뒤 코드를 받을 수 있도록 한다.

### 해결하는 문제

| 대상 | 문제 | 솔루션 |
|------|------|--------|
| 주니어 개발자 | 프로젝트 초기 아키텍처 결정과 설정에 시간이 소요된다 | 선택 옵션 기반 커스터마이징 자동화 + 분석 문서 검토로 방향 확인 |
| 시니어 개발자 | PoC/MVP 검증을 위한 반복적인 보일러플레이트 작성이 비효율적이다 | 기술 스택 직접 지정 + 분석 문서 피드백으로 구조 조정 후 즉시 생성 |

---

## 2. 핵심 기능 목록

### Must-have (MVP에 반드시 포함)

| ID | 기능명 | 설명 |
|----|--------|------|
| F-01 | 자연어 요구사항 입력 | 최대 10,000자 자유 형식 텍스트 입력 |
| F-02 | MVP 프로젝트 자동 생성 | Claude Agent SDK를 통한 코드 생성 파이프라인 실행 (분석 → 피드백 대기 → 개발 → 테스트 → 업로드) |
| F-02a | 분석 문서 생성 및 반환 | analyzing 단계 완료 후 ERD, API 설계, 아키텍처 요약 MD 문서를 UI에 표시 |
| F-02b | 사용자 피드백 제출 | 분석 문서 검토 후 승인 또는 수정 요청 제출 → 개발 단계 트리거 |
| F-02c | 테스트 리포트 반환 | 테스트 실행 결과(통과/실패/커버리지 요약)를 clone URL과 함께 제공 |
| F-03 | 실시간 생성 진행률 표시 | SSE로 단계별 상태 및 퍼센테이지 표시 |
| F-04 | GitHub repo 자동 생성 및 업로드 | 사용자 GitHub OAuth token으로 사용자 본인 계정에 repo 자동 커밋. repo명: `mvp-{keyword}-{username}` |
| F-05 | clone URL 제공 | 완료 후 즉시 사용 가능한 git clone URL 반환 |
| F-06 | GitHub OAuth 로그인 | GitHub 계정으로 회원가입/로그인. 별도 이메일/비밀번호 불필요. |
| F-07 | 생성 이력 조회 | 사용자가 이전 생성 결과물 목록 및 clone URL 재확인 |
| F-08 | 개발자 옵션 (선택 입력) | 기술 스택, 아키텍처, 배포 방식 지정 (Progressive Disclosure). UI는 combobox 패턴 (선택지 + 자유 입력 혼합). |

### Should-have (없어도 출시 가능하나 핵심 가치를 높임)

| ID | 기능명 | 설명 |
|----|--------|------|
| F-09 | 생성 중 취소 기능 | 진행 중인 생성 작업 사용자 취소 |
| F-10 | 생성 결과 파일 트리 미리보기 | 생성된 파일 구조 UI에서 확인 |

### Nice-to-have (이후 버전 고려)

| ID | 기능명 | 설명 |
|----|--------|------|
| F-11 | 생성 결과 재생성/수정 요청 | 동일 요구사항으로 재생성 또는 추가 수정 요청 |
| F-12 | 공개/비공개 저장소 선택 | GitHub repo 가시성 설정 |
| F-13 | BYOK (Bring Your Own Key) | 사용자가 자신의 Anthropic API key 직접 입력 (세션에만 보관, DB 미저장) |
| F-14 | 팀 공유 기능 | 생성 결과물을 팀원과 공유 |
| F-15 | 생성 템플릿 저장 | 자주 사용하는 옵션 조합 저장 |

---

## 3. 사용자 스토리

### 인증

- As a **신규 방문자**, I want to **GitHub 계정으로 원클릭 로그인**할 수 있기를 원한다, So that **별도 회원가입 없이 즉시 서비스를 이용할 수 있다**.
- As a **로그인한 사용자**, I want to **로그아웃하고 세션을 종료**할 수 있기를 원한다, So that **내 계정을 안전하게 보호할 수 있다**.

### MVP 생성 (개발자 공통)

- As a **개발자**, I want to **자연어로 요구사항을 설명하면 AI가 분석 문서를 먼저 보여주기를** 원한다, So that **AI가 내 요구사항을 어떻게 해석했는지 확인하고 수정 방향을 잡을 수 있다**.
- As a **개발자**, I want to **분석 문서에 피드백을 제출한 후 개발이 시작되기를** 원한다, So that **잘못된 방향으로 코드가 생성되는 것을 사전에 방지할 수 있다**.
- As a **개발자**, I want to **생성 완료 후 테스트 리포트를 함께 받기를** 원한다, So that **코드가 실제로 동작하는지 clone 전에 확인할 수 있다**.
- As a **개발자**, I want to **생성된 결과가 내 GitHub 계정 저장소로 자동 업로드되기를** 원한다, So that **별도 설정 없이 바로 clone해서 사용할 수 있다**.

### MVP 생성 (기술 스택 지정)

- As a **개발자**, I want to **기술 스택(언어, 프레임워크), 아키텍처, 배포 방식을 직접 지정**할 수 있기를 원한다, So that **내 프로젝트 요구사항에 맞는 코드베이스를 받을 수 있다**.

### 생성 이력

- As a **로그인한 사용자**, I want to **과거에 생성한 프로젝트 목록과 각 clone URL을 다시 확인**할 수 있기를 원한다, So that **브라우저를 닫아도 결과물을 잃지 않는다**.

---

## 4. 비기능 요구사항

### 성능 목표

| 항목 | 목표 |
|------|------|
| 초기 페이지 로드 LCP | 2.5초 이하 |
| 사용자 입력 UI 반응 | 100ms 이내 |
| 생성 시작 후 첫 SSE 이벤트 도달 | 3초 이내 |
| MVP 생성 전체 소요 시간 | 평균 5분 이내 (목표, 피드백 대기 시간 제외), time limit는 운영 중 측정 후 결정 |

> 가정: MVP 생성 전체 소요 시간은 Claude Agent SDK 처리 시간에 크게 의존한다. 피드백 대기 시간은 사용자 액션에 따라 달라지므로 소요 시간 측정에서 제외한다.

[결정] 생성 타임아웃 처리: time limit 초과 시 사용자에게 SSE로 타임아웃 알림 전달 및 "요구사항을 간소화한 후 재시도해주세요" 메시지 표시. 작업은 자동 취소.

[결정] 피드백 대기 타임아웃: awaiting_feedback 상태에서 24시간 내 피드백 미제출 시 Generation 상태를 `timeout`으로 자동 처리.

### 보안 요구사항

| 항목 | 요구사항 |
|------|---------|
| 인증 방식 | GitHub OAuth 2.0. JWT (Access Token 15분) |
| GitHub OAuth Token | AES-256 암호화 후 DB 저장 |
| HTTPS | 프로덕션 전 환경 강제 적용 |
| 민감 정보 | 환경 변수 관리, 로그 마스킹, `.env.example`만 저장소 커밋 |
| 입력 검증 | NestJS `ValidationPipe` + `class-validator`, 자연어 입력 최대 10,000자 |
| 코드 실행 격리 | 생성된 코드를 서버에서 실행하지 않음 (C-SEC-11) |
| Claude API key (MVP) | 운영자 소유, 환경 변수로만 관리, 사용자에게 노출 안 됨 |
| Claude API key (BYOK, 이후) | 사용자 직접 입력, 세션에만 보관, DB 미저장 |
| Rate Limiting | MVP 초기 미적용, 추후 사용량 기반 결정 |

### 확장성 고려사항

| 항목 | 전략 |
|------|------|
| 생성 요청 처리 | BullMQ + Redis 큐, 사용자당 동시 생성 1건 제한. 이미 진행 중인 작업이 있을 경우 대기 안내 표시, time limit 초과 시 대기 중 작업 자동 취소 |
| 수평 확장 | Docker 컨테이너 기반, AWS 환경에서 인스턴스 수 증가 가능 |
| DB 확장 | 초기 단일 인스턴스, 트래픽 증가 시 Read Replica 도입 검토 |
| 모니터링 | 초기 CloudWatch Logs, 이후 Datadog/Grafana 도입 검토 |

### 지원 플랫폼 및 환경

| 항목 | 스펙 |
|------|------|
| 주요 환경 | 데스크톱 브라우저 (Desktop First) |
| 최소 뷰포트 | 1280px (데스크톱), 375px (모바일) |
| 지원 브라우저 | Chrome, Firefox, Safari, Edge 최신 2개 버전 |
| 접근성 기준 | WCAG 2.1 Level AA |
| 배포 환경 | AWS + Docker (local / staging / production 3단계 분리) |

### 기술 스택 요약

```
Backend   : Node.js + NestJS (TypeScript strict)
Frontend  : React (TypeScript strict)
AI        : Claude Agent SDK (Anthropic)
실시간     : SSE (Server-Sent Events)
Queue     : BullMQ + Redis
외부 연동  : GitHub REST API v3, GitHub OAuth API
인증      : GitHub OAuth 2.0 + JWT
배포      : AWS + Docker (multi-stage build)
CI/CD     : GitHub Actions
테스트     : Jest + Supertest (Backend), Vitest + Playwright (Frontend/E2E)
```

---

## 5. 생성 파이프라인 흐름

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant BE as Backend (NestJS)
    participant Queue as BullMQ + Redis
    participant Agent as Claude Agent SDK
    participant GH as GitHub API

    User->>FE: 요구사항 입력 (+ 선택 옵션)
    FE->>BE: POST /generation
    BE->>Queue: 생성 작업 enqueue
    BE-->>FE: jobId 반환
    FE->>BE: GET /generation/:jobId/stream (SSE 연결)

    Note over Agent: 1단계: 분석 (0~20%)
    Queue->>Agent: 분석 작업 시작
    Agent-->>BE: 분석 문서 생성 완료
    BE-->>FE: SSE: event=analysis_ready (percent=20)

    Note over FE,User: 사용자 분석 문서 검토
    FE->>BE: GET /generation/:jobId/analysis
    BE-->>FE: 분석 문서 반환
    User->>FE: 피드백 입력 후 승인 또는 수정 요청
    FE->>BE: POST /generation/:jobId/feedback

    Note over Agent: 2단계: 개발 (20~80%)
    Queue->>Agent: 개발 작업 시작 (피드백 반영)
    Agent-->>BE: 단계별 이벤트
    BE-->>FE: SSE: event=progress (stage=developing)

    Note over Agent: 3단계: 테스트 (80~90%)
    Agent-->>BE: 테스트 리포트 생성 완료
    BE-->>FE: SSE: event=progress (stage=testing)

    Note over Agent: 4단계: 업로드 (90~99%)
    BE->>GH: 사용자 계정 repo 생성 + 파일 커밋
    GH-->>BE: clone URL
    BE-->>FE: SSE: event=completed (cloneUrl, testReport)
    FE->>User: 테스트 리포트 + clone URL 표시
```

---

## 6. 데이터 모델 (핵심)

```mermaid
erDiagram
    USER {
        uuid id PK
        string github_id UK
        string github_username
        string github_access_token
        string email
        string username UK
        datetime createdAt
    }
    GENERATION {
        uuid id PK
        uuid userId FK
        text requirements
        json developerOptions
        string status
        int progressPercent
        string currentStage
        json analysisDoc
        text userFeedback
        json testReport
        string cloneUrl
        json fileTree
        datetime createdAt
        datetime completedAt
    }

    USER ||--o{ GENERATION : "has"
```

**Generation status 값**: `pending` | `analyzing` | `awaiting_feedback` | `developing` | `testing` | `uploading` | `completed` | `failed` | `timeout`

---

## 7. 데이터 정책

### 생성 이력 보존 정책

[결정] 생성 이력(GENERATION 레코드 및 GitHub repo)은 계정이 존재하는 한 무기한 보존한다.

| 대상 | 보존 기간 | 삭제 트리거 |
|------|----------|-----------|
| 생성 이력 (DB) | 무기한 | 계정 삭제 또는 사용자 명시적 삭제 요청 |
| GitHub repo | 무기한 (GitHub 측 보존) | 사용자가 직접 GitHub에서 삭제 |

### GitHub repo 네이밍 규칙

[결정] 생성되는 GitHub repo명은 `mvp-{keyword}-{username}` 형식을 따른다.
- `{keyword}`: 요구사항에서 추출한 핵심 키워드 (소문자, 하이픈 구분)
- `{username}`: 사용자의 GitHub username
- 예시: `mvp-todo-app-john-doe`
