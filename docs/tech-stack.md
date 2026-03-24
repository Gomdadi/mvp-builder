# 기술 스택 결정서
# mvp-builder

> 작성일: 2026-03-17
> 작성자: Architecture Agent (3단계)
> 기반 문서: `docs/constitution.md`, `docs/PRD.md`, `docs/MVP-scope.md`

---

## 1. 최종 결정 요약

| 영역 | 결정 기술 | 상태 |
|------|----------|------|
| Backend 언어/프레임워크 | Node.js + NestJS (TypeScript strict) | [결정] |
| Frontend 프레임워크 | React (TypeScript strict) | [결정] |
| 상태 관리 | Zustand | [결정] |
| ORM | Prisma | [결정] |
| 메인 DB | PostgreSQL | [결정] |
| 캐시 / 큐 브로커 | Redis | [결정] |
| 메시지 큐 | BullMQ | [결정] |
| AI 연동 | Claude Agent SDK (Anthropic) | [결정] |
| 실시간 통신 | SSE (Server-Sent Events) | [결정] |
| 이메일 발송 | Nodemailer + Gmail SMTP | [결정] |
| 외부 연동 | GitHub REST API v3 | [결정] |
| 인증 방식 | JWT (Access 15분) + Refresh Token (7일, DB 저장) | [결정] |
| 배포 환경 | AWS + Docker (multi-stage build) | [결정] |
| CI/CD | GitHub Actions | [결정] |
| 테스트 | Jest + Supertest (Backend) / Vitest + Playwright (Frontend/E2E) | [결정] |

---

## 2. 레이어별 상세 결정

### 2.1 Backend

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| 런타임 | Node.js 20 LTS | Claude Agent SDK가 Node.js 환경에서 공식 지원. 팀 기술 스택 일치. |
| 프레임워크 | NestJS 10 | 모듈 기반 도메인 분리(auth, user, generation, github, sse) 요구사항과 부합. TypeScript strict 지원. DI 컨테이너로 테스트 가용성 높음. |
| 언어 | TypeScript 5 (strict: true) | C-CODE-01 요구사항. 공유 타입 정의(`shared/types`) 활용 가능. |
| ORM | Prisma | 타입 안전 쿼리 생성. 마이그레이션 파일 자동 관리. NestJS와 통합 용이. ERD → 스키마 변환 흐름이 직관적. |
| 유효성 검사 | class-validator + class-transformer | C-SEC-09. NestJS `ValidationPipe`와 네이티브 통합. |
| 패스워드 해싱 | bcrypt (salt rounds: 12) | C-SEC-05 요구사항. |
| 환경 변수 | @nestjs/config + joi | 런타임 환경 변수 검증으로 미설정 시 즉시 에러. |
| 로깅 | NestJS built-in Logger + JSON 직렬화 | C-INFRA-10. 구조화된 JSON 로그. 프로덕션에서 CloudWatch 수집. |

### 2.2 Frontend

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| 프레임워크 | React 18 | [결정] constitution.md. SPA로 충분한 규모. |
| 번들러 | Vite | CRA 대비 빠른 HMR. Vitest와 통합 편의. |
| 언어 | TypeScript 5 (strict: true) | C-CODE-02 요구사항. |
| 상태 관리 | Zustand | 보일러플레이트가 적고 TypeScript 지원이 우수. Redux 대비 초기 설정 비용 낮음. Recoil은 실험적 API 불안정 이력 존재. |
| 서버 상태 | TanStack Query (React Query) | API 호출 캐시, 로딩/에러 상태 관리. 생성 이력 목록 등 서버 상태 처리에 적합. |
| SSE 클라이언트 | 브라우저 native `EventSource` API | 외부 라이브러리 불필요. NestJS SSE 모듈과 직접 연동. |
| 스타일링 | Tailwind CSS | 빠른 프로토타이핑. 디자인 시스템 없이도 일관된 UI 구성 가능. |
| UI 컴포넌트 | shadcn/ui | Radix UI 기반. WCAG 2.1 Level AA 접근성 지원. C-UX-04. |
| 폼 관리 | React Hook Form + zod | 유효성 검사 스키마를 Backend DTO와 공유 타입으로 연계 가능. |
| 라우팅 | React Router v6 | SPA 라우팅. |

### 2.3 데이터베이스 / 캐시

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| 메인 DB | PostgreSQL 16 | 관계형 데이터 모델(USER, GENERATION, REFRESH_TOKEN). JSONB 타입으로 `developerOptions`, `fileTree` 컬럼 지원. |
| 캐시 / 큐 브로커 | Redis 7 | BullMQ 큐 브로커 역할 겸용. Refresh Token 블랙리스트 처리 옵션. |
| 큐 | BullMQ | C-AGENT-03. Redis 기반. NestJS 공식 `@nestjs/bull` 통합 지원. 재시도, 지연, 동시 실행 수 제어 기능. |

### 2.4 인증

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| 인증 방식 | JWT (Access Token) + DB 저장 Refresh Token | C-SEC-02, C-SEC-03. Access Token 15분 만료. Refresh Token 7일 만료. Rotation 정책 적용. |
| JWT 라이브러리 | @nestjs/jwt + passport-jwt | NestJS 공식 지원. `AuthGuard` 통합. |
| 이메일 발송 | Nodemailer + Gmail SMTP | [결정]. 초기 비용 없이 이메일 인증 메일 발송. 운영자 Gmail 계정 사용. |

### 2.5 외부 연동

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| GitHub 연동 | GitHub REST API v3 (@octokit/rest) | [결정]. 운영자 소유 GitHub token으로 공개 repo 자동 생성. repo명: `mvp-{keyword}-{username}` |
| Claude AI | @anthropic-ai/sdk (Claude Agent SDK) | [결정]. 생성 파이프라인(분석 → 문서화 → 개발 → 테스트) 실행. 운영자 API key 환경 변수 관리. |

### 2.6 인프라 / 배포

| 항목 | 선택 | 선택 이유 |
|------|------|----------|
| 컨테이너 | Docker (multi-stage build) | C-INFRA-01, C-INFRA-03. 이미지 크기 최소화. |
| 로컬 개발 | docker-compose | C-INFRA-02. Backend + Frontend + PostgreSQL + Redis 전체 스택 실행. |
| 클라우드 | AWS | [결정]. EC2 또는 ECS(Fargate) 선택 가능. 초기 EC2 + Docker Compose 단순 구성. |
| 로깅 | AWS CloudWatch Logs | C-INFRA-10, C-INFRA-13. 초기 모니터링. |
| 비밀 관리 | .env (개발) / AWS Secrets Manager (프로덕션) | C-SEC-12, C-SEC-14. |
| CI/CD | GitHub Actions | C-INFRA-04. PR 시 lint + test, main push 시 프로덕션 배포. |

### 2.7 테스트

| 계층 | 도구 | 대상 | 커버리지 목표 |
|------|------|------|-------------|
| Unit | Jest (Backend) / Vitest (Frontend) | 서비스 로직, 유틸 함수, React 컴포넌트 | 핵심 비즈니스 로직 80% 이상 |
| Integration | Jest + Supertest | 전체 API 엔드포인트 (성공/실패) | 100% |
| E2E | Playwright | 핵심 사용자 시나리오 3개 (C-TEST-08, 09, 10) | 시나리오 전체 통과 |

---

## 3. 대안 비교표

### Backend 프레임워크

| 후보 | 선택 여부 | 미선택 이유 |
|------|----------|------------|
| **NestJS** | 선택 | 모듈 분리, DI, TypeScript 네이티브, BullMQ/SSE 공식 모듈 |
| Express.js | 미선택 | 구조 강제 없음. 대규모 확장 시 아키텍처 일관성 유지 어려움. |
| Fastify | 미선택 | NestJS와 조합 가능하나 초기 복잡도 증가. |
| FastAPI (Python) | 미선택 | 팀 스택 불일치. TypeScript 공유 타입 불가. |

### Frontend 프레임워크

| 후보 | 선택 여부 | 미선택 이유 |
|------|----------|------------|
| **React 18** | 선택 | [결정]. SSR 불필요한 SPA로 충분. |
| Next.js | 미선택 | SSR/SSG 기능 불필요. App Router 복잡도 대비 이득 없음. 단순 SPA로 충분. |
| Vue.js | 미선택 | 팀 선호도 미확인. React 결정으로 불필요. |

### 상태 관리

| 후보 | 선택 여부 | 미선택 이유 |
|------|----------|------------|
| **Zustand** | 선택 | 최소 보일러플레이트. TypeScript 지원 우수. 전역 상태 범위가 작은 MVP에 적합. |
| Redux Toolkit | 미선택 | 초기 설정 비용 과다. MVP 규모에 과도함. |
| Recoil | 미선택 | Meta에서 유지보수 불확실성. |
| Jotai | 미선택 | Zustand와 유사하나 생태계 성숙도 낮음. |

### ORM

| 후보 | 선택 여부 | 미선택 이유 |
|------|----------|------------|
| **Prisma** | 선택 | 타입 안전, 마이그레이션 자동화, NestJS 통합 용이. |
| TypeORM | 미선택 | 데코레이터 기반 설정 복잡. 타입 추론 한계. |
| Drizzle ORM | 미선택 | 생태계 성숙도 낮음. NestJS 공식 통합 미제공. |
| Sequelize | 미선택 | 레거시. TypeScript 지원 후발. |

### 메인 DB

| 후보 | 선택 여부 | 미선택 이유 |
|------|----------|------------|
| **PostgreSQL** | 선택 | 관계형 모델 + JSONB. 안정적. Prisma 지원 최우수. |
| MySQL | 미선택 | JSONB 지원 제한. PostgreSQL 대비 기능 열위. |
| MongoDB | 미선택 | 관계형 데이터(USER-GENERATION 관계)에 부적합. |
| Supabase | 미선택 | 플랫폼 종속. 경쟁사 분석에서 종속 문제 명시됨. |

### 이메일 발송

| 후보 | 선택 여부 | 미선택 이유 |
|------|----------|------------|
| **Nodemailer + Gmail SMTP** | 선택 | [결정]. 초기 비용 없음. 운영자 계정 즉시 활용. |
| SendGrid | 미선택 | 무료 플랜 한도 제한. 추가 서비스 의존. |
| AWS SES | 미선택 | 설정 복잡도. MVP 초기에 과도한 인프라. |

---

## 4. repo 네이밍 규칙 상세

[결정] GitHub repo명: `mvp-{keyword}-{username}`

| 항목 | 처리 규칙 | 예시 |
|------|----------|------|
| keyword | 요구사항에서 Claude가 추출. 소문자, 하이픈 구분, 최대 30자 | `todo-app`, `reservation-system` |
| username | 사용자의 서비스 가입 username (이메일 아님) | `john-doe` |
| 특수문자 처리 | 소문자 변환, 영문/숫자/하이픈만 허용. 기타 문자는 하이픈으로 대체 | `John Doe` → `john-doe` |
| 최종 예시 | | `mvp-todo-app-john-doe` |

> 이전 결정(T6): repo명에 이메일 대신 username을 사용. `mvp-{keyword}-{userEmail}` 형식에서 `mvp-{keyword}-{username}` 형식으로 변경.

---

## 5. 모노레포 구조

[결정] 모노레포 구조: `apps/backend` + `apps/frontend` + `packages/shared`

```
mvp-builder/
├── apps/
│   ├── backend/          # NestJS
│   └── frontend/         # React + Vite
├── packages/
│   └── shared/           # 공유 타입 정의 (@mvp-builder/types)
├── docs/                 # 문서
├── docker-compose.yml
├── .github/
│   └── workflows/        # GitHub Actions CI/CD
└── .env.example
```

---

## 6. 환경 변수 목록 (예상)

| 변수명 | 설명 | 환경 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 전체 |
| `REDIS_URL` | Redis 연결 문자열 | 전체 |
| `JWT_SECRET` | JWT 서명 키 | 전체 |
| `JWT_REFRESH_SECRET` | Refresh Token 서명 키 | 전체 |
| `ANTHROPIC_API_KEY` | Claude API key (운영자 소유) | 전체 |
| `GITHUB_TOKEN` | GitHub Personal Access Token (운영자 소유, repo 생성 권한) | 전체 |
| `GITHUB_OWNER` | 생성 repo 소유자 (운영자 GitHub 계정명) | 전체 |
| `GMAIL_USER` | 이메일 발송 계정 | 전체 |
| `GMAIL_APP_PASSWORD` | Gmail 앱 비밀번호 | 전체 |
| `APP_URL` | 서비스 URL (이메일 인증 링크용) | 전체 |
| `PORT` | NestJS 서버 포트 | 전체 |
| `JWT_EXPIRES_IN` | Access Token 만료 시간 (예: `15m`) | 전체 |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 만료 시간 (예: `7d`) | 전체 |
| `FRONTEND_URL` | Frontend URL (CORS 허용 Origin) | 전체 |
| `NODE_ENV` | `development` / `production` | 전체 |
