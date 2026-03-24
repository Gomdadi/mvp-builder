# mvp-builder 프로젝트 헌법

> 이 문서는 mvp-builder 프로젝트의 모든 의사결정, 코드 작성, 문서화의 최상위 기준이다.
> 이후 단계의 모든 에이전트는 이 원칙을 준수해야 한다.
> 작성일: 2026-03-17

---

## 1. 프로젝트 비전

### 한 줄 비전 선언문

> "누구나 자연어 요구사항 하나로, 즉시 실행 가능한 MVP를 GitHub 저장소로 받아볼 수 있다."

### 핵심 가치

| ID | 키워드 | 설명 |
|----|--------|------|
| C-VAL-01 | **Accessibility** | 개발 경험이 없는 사용자도 MVP를 생성할 수 있어야 한다. 개발자에게는 세밀한 제어 옵션을 제공한다. |
| C-VAL-02 | **Transparency** | AI 에이전트의 작업 진행 상황을 실시간으로 사용자에게 노출한다. 블랙박스 처리를 금지한다. |
| C-VAL-03 | **Reliability** | 생성된 코드는 실행 가능한 상태여야 한다. 에러 없이 clone → install → run이 보장되어야 한다. |
| C-VAL-04 | **Simplicity** | 핵심 흐름(요구사항 입력 → 생성 → clone URL 수령)은 최소한의 단계로 완결되어야 한다. |
| C-VAL-05 | **Extensibility** | 기술 스택, 아키텍처, 배포 방식 등 선택 옵션을 통해 개발자가 결과물을 제어할 수 있어야 한다. |

---

## 2. 기술 스택 [결정]

| 영역 | 기술 |
|------|------|
| Backend | Node.js + NestJS |
| Frontend | React |
| AI | Claude Agent SDK (Anthropic) |
| 실시간 통신 | SSE (Server-Sent Events) |
| 외부 연동 | GitHub API (자동 repo 생성) |
| 배포 | AWS + Docker |
| 인증 | 이메일 기반 회원가입/로그인 |

---

## 3. 코드 품질 기준

### 언어 및 타입 안전성

- **C-CODE-01** [결정] Backend는 TypeScript strict 모드를 사용한다. `tsconfig.json`에 `"strict": true`를 명시한다.
- **C-CODE-02** [결정] Frontend는 TypeScript strict 모드를 사용한다.
- **C-CODE-03** `any` 타입 사용을 금지한다. 불가피한 경우 `unknown`을 사용하고 타입 가드를 작성한다.
- **C-CODE-04** API 요청/응답 타입은 Backend와 Frontend 간 공유 타입 정의 파일(`shared/types`)로 관리한다.

> 가정: 공유 타입은 별도 패키지(`@mvp-builder/types`)로 분리하거나 모노레포 내 공유 디렉터리로 관리한다. 초기에는 공유 디렉터리 방식으로 시작한다.

### 코드 스타일

- **C-CODE-05** ESLint + Prettier를 공통으로 사용한다. 설정 파일은 루트에 위치한다.
- **C-CODE-06** NestJS Backend는 `@nestjs/eslint-plugin` 규칙을 따른다.
- **C-CODE-07** React Frontend는 `eslint-plugin-react-hooks` 규칙을 따른다.
- **C-CODE-08** import 정렬은 `eslint-plugin-import`로 자동화한다. (node_modules → 내부 모듈 → 상대 경로 순)

### 복잡도 관리

- **C-CODE-09** 단일 함수는 50줄을 초과하지 않는다. 초과 시 분리 여부를 검토한다.
- **C-CODE-10** 단일 모듈(서비스, 컨트롤러 등)은 300줄을 초과하지 않는다.
- **C-CODE-11** 중첩 조건문은 3단계를 초과하지 않는다. Early return 패턴을 사용한다.
- **C-CODE-12** NestJS 모듈 단위로 도메인을 분리한다. (auth, user, generation, github, sse 등)

### 에러 처리

- **C-CODE-13** Backend에서 모든 에러는 NestJS `ExceptionFilter`를 통해 표준 형식으로 응답한다.
- **C-CODE-14** 표준 에러 응답 형식: `{ statusCode, message, error, timestamp, path }`
- **C-CODE-15** Claude Agent SDK 호출 실패는 재시도 로직(최대 3회, exponential backoff)을 포함한다.
- **C-CODE-16** GitHub API 호출 실패는 사용자에게 SSE를 통해 즉시 에러 상태를 전달한다.
- **C-CODE-17** 에러 로그는 `ERROR` 레벨로 기록하며 stack trace를 포함한다. 민감 정보(token, password)는 마스킹한다.

---

## 4. 테스트 전략 [결정]

### 테스트 계층

| 계층 | 기준 | 커버리지 목표 | 도구 |
|------|------|-------------|------|
| Unit | 컴포넌트/서비스/유틸 단위 | 핵심 비즈니스 로직 80% 이상 | Jest (Backend), Vitest (Frontend) |
| Integration | API 엔드포인트 기준 | 전체 API 엔드포인트 100% | Jest + Supertest |
| E2E | 서비스 시나리오 기준 | 핵심 사용자 시나리오 | Playwright |

### 테스트 필수 대상

- **C-TEST-01** 모든 API 엔드포인트에 대한 통합 테스트를 작성한다. (성공/실패 케이스 포함)
- **C-TEST-02** 인증 흐름 전체 (회원가입 → 이메일 인증 → 로그인 → 토큰 갱신 → 로그아웃)
- **C-TEST-03** MVP 생성 파이프라인의 각 단계별 서비스 로직
- **C-TEST-04** GitHub API 연동 서비스 (repo 생성, 파일 커밋, clone URL 반환)
- **C-TEST-05** SSE 이벤트 발행 로직 (진행 상태, 에러 상태 포함)

### 테스트 선택 대상

- **C-TEST-06** React UI 컴포넌트 (주요 상태 변화가 있는 컴포넌트 우선)
- **C-TEST-07** 유틸리티 함수 (순수 함수는 단위 테스트 권장)

### E2E 핵심 시나리오

- **C-TEST-08** 비개발자 시나리오: 자연어 입력 → 생성 → clone URL 수령
- **C-TEST-09** 개발자 시나리오: 자연어 입력 + 기술 스택/아키텍처 선택 → 생성 → clone URL 수령
- **C-TEST-10** 에러 시나리오: 생성 중 실패 → 에러 메시지 표시 → 재시도

### 모킹 원칙

- **C-TEST-11** 외부 서비스(Claude API, GitHub API, 이메일 서비스)는 반드시 모킹한다.
- **C-TEST-12** 통합 테스트에서 DB는 실제 테스트 DB 인스턴스를 사용한다. 인메모리 DB(SQLite)로 대체 가능하다.
- **C-TEST-13** SSE 스트림 테스트는 EventSource를 모킹하여 단위 테스트한다.

---

## 5. 보안 원칙

### 인증/인가

- **C-SEC-01** [결정] 이메일 기반 회원가입/로그인을 사용한다.
- **C-SEC-02** Access Token은 JWT로 발급하며 만료 시간은 15분으로 설정한다.
- **C-SEC-03** Refresh Token은 DB에 저장하며 만료 시간은 7일로 설정한다.
- **C-SEC-04** 모든 인증이 필요한 API는 NestJS `AuthGuard`로 보호한다.
- **C-SEC-05** 비밀번호는 bcrypt(salt rounds: 12)로 해싱하여 저장한다. 평문 저장을 금지한다.

> 가정: 이메일 인증(회원가입 시 이메일 확인)을 포함한다. 인증 전 API 접근은 제한된다.

### 민감 데이터 처리

- **C-SEC-06** 사용자 비밀번호, JWT secret, GitHub token, Claude API key는 절대 로그에 기록하지 않는다.
- **C-SEC-07** API 응답에 비밀번호 해시를 포함하지 않는다. DTO에서 명시적으로 제외한다.
- **C-SEC-08** [결정 변경] GitHub token은 운영자 소유의 서비스 공용 token만 사용하며, 환경 변수(AWS Secrets Manager)로만 관리하고 DB에 저장하지 않는다. 사용자별 GitHub token 등록 기능은 제공하지 않는다.

> ~~가정: 사용자가 자신의 GitHub token을 등록하여 사용한다. 서비스 공용 token은 환경 변수로만 관리한다.~~ (이전 가정은 실제 설계 결정으로 대체됨. 운영자 소유 token을 환경 변수로만 관리하는 방식으로 확정. `system-architecture.md` 5.2절, `erd.md` 참조)

### 외부 입력 검증

- **C-SEC-09** 모든 API 요청 데이터는 NestJS `ValidationPipe`와 `class-validator`로 서버 측에서 검증한다. 클라이언트 측 검증만으로는 불충분하다.
- **C-SEC-10** 자연어 요구사항 입력은 길이 제한(최대 10,000자)을 적용한다.
- **C-SEC-11** 생성된 코드를 서버에서 실행하지 않는다. 코드 생성과 실행은 분리된다.

### 비밀 정보 관리

- **C-SEC-12** 모든 비밀 정보는 환경 변수(`.env`)로 관리한다. 코드에 하드코딩을 금지한다.
- **C-SEC-13** `.env` 파일은 `.gitignore`에 포함한다. `.env.example`만 저장소에 커밋한다.
- **C-SEC-14** 프로덕션 환경에서는 AWS Secrets Manager 또는 AWS Parameter Store를 사용한다.

> 가정: 개발 환경은 `.env` 파일, 프로덕션은 AWS Secrets Manager를 사용한다.

### API 남용 방지

- **C-SEC-15** [결정] 초기에는 rate limiting을 적용하지 않는다. 추후 사용량 기반으로 결정한다.

---

## 6. UX 원칙

### 디자인 철학

- **C-UX-01** 비개발자와 개발자 모두를 위한 Progressive Disclosure 전략을 사용한다. 기본 UI는 단순하고, 개발자 옵션은 접어두었다가 펼치는 방식으로 제공한다.
- **C-UX-02** 핵심 흐름(요구사항 입력 → 생성 → 결과 수령)은 단일 페이지에서 완결된다.
- **C-UX-03** 생성 진행 상태는 SSE를 통해 실시간으로 표시한다. "처리 중" 스피너만으로는 불충분하다. 현재 단계(분석 중 / 코드 생성 중 / repo 생성 중 등)를 텍스트로 표시한다.

### 접근성

- **C-UX-04** WCAG 2.1 Level AA를 기준으로 한다.
- **C-UX-05** 모든 인터랙티브 요소는 키보드로 접근 가능해야 한다.
- **C-UX-06** 색상만으로 정보를 전달하지 않는다. (에러는 색상 + 아이콘 + 텍스트 조합)

### 반응형 전략

- **C-UX-07** Desktop First로 개발한다. 주 사용 환경은 데스크톱 브라우저다.
- **C-UX-08** 최소 지원 뷰포트: 1280px (데스크톱), 375px (모바일)

> 가정: MVP 단계에서 모바일 최적화는 기본 수준으로 유지하고, 데스크톱 경험을 우선 완성한다.

### 성능 UX 기준

- **C-UX-09** 초기 페이지 로드 LCP(Largest Contentful Paint): 2.5초 이하
- **C-UX-10** 사용자 입력에 대한 즉각적 피드백: 100ms 이내 UI 반응
- **C-UX-11** MVP 생성 시작 후 첫 번째 SSE 이벤트 도달: 3초 이내
- **C-UX-12** 생성 중 사용자가 페이지를 벗어날 경우 경고 다이얼로그를 표시한다.

---

## 7. 인프라 및 배포 원칙

### 컨테이너화

- **C-INFRA-01** [결정] Backend와 Frontend 모두 Docker 컨테이너로 패키징한다.
- **C-INFRA-02** `docker-compose.yml`로 로컬 개발 환경 전체(Backend, Frontend, DB)를 실행할 수 있어야 한다.
- **C-INFRA-03** 프로덕션 Docker 이미지는 multi-stage build를 사용하여 이미지 크기를 최소화한다.

### CI/CD 파이프라인

- **C-INFRA-04** GitHub Actions를 사용하여 CI/CD 파이프라인을 구성한다.
- **C-INFRA-05** PR 생성 시 자동으로 lint + unit test + integration test를 실행한다.
- **C-INFRA-06** `main` 브랜치 push 시 프로덕션 배포가 자동 트리거된다.
- **C-INFRA-07** 테스트 실패 시 배포가 차단된다.

### 환경 분리

- **C-INFRA-08** 개발(local), 스테이징(staging), 프로덕션(production) 3개 환경을 분리한다.
- **C-INFRA-09** 각 환경은 독립적인 DB 인스턴스와 환경 변수를 가진다.

> 가정: 스테이징 환경은 AWS 상에 별도 인프라로 구성하며, 프로덕션과 동일한 구성을 유지한다.

### 모니터링 및 로깅

- **C-INFRA-10** 구조화된 JSON 로그를 사용한다. (`timestamp`, `level`, `service`, `message`, `context` 필드 포함)
- **C-INFRA-11** 로그 레벨: `ERROR`, `WARN`, `INFO`, `DEBUG`. 프로덕션은 `INFO` 이상만 출력한다.
- **C-INFRA-12** Claude Agent SDK 호출 시작/완료/실패는 반드시 `INFO` 레벨로 기록한다. (소요 시간 포함)
- **C-INFRA-13** GitHub API 호출 결과는 반드시 기록한다. (repo 생성 성공/실패)

> 가정: 초기 MVP에서는 CloudWatch Logs를 사용한다. 트래픽 증가 후 별도 모니터링 도구(Datadog, Grafana 등) 도입을 검토한다.

---

## 8. Claude Agent SDK 사용 원칙

- **C-AGENT-01** Claude Agent SDK를 사용하는 서비스는 독립된 NestJS 모듈로 분리한다.
- **C-AGENT-02** Agent 실행 중 발생하는 모든 스텝 이벤트는 SSE를 통해 클라이언트에 전달한다.
- **C-AGENT-03** 생성 요청은 큐(Queue) 방식으로 처리한다. 동시 실행 수에 제한을 둔다.

> 가정: 초기 MVP에서는 사용자당 동시 생성 1건으로 제한한다. 큐는 BullMQ + Redis로 구현한다.

- **C-AGENT-04** Agent에게 전달하는 프롬프트는 별도 파일(`prompts/`)로 관리하며 코드에 하드코딩하지 않는다.
- **C-AGENT-05** 생성 결과물(파일 트리, 코드)은 DB에 저장하여 사용자가 이후에도 조회할 수 있도록 한다.

---

## 9. 의사결정 기록 요약

| 항목 | 결정 내용 | 상태 |
|------|-----------|------|
| Backend 프레임워크 | Node.js + NestJS | [결정] |
| Frontend 프레임워크 | React | [결정] |
| 실시간 통신 | SSE | [결정] |
| GitHub 연동 | GitHub API 자동 repo 생성 | [결정] |
| 배포 환경 | AWS + Docker | [결정] |
| 인증 방식 | 이메일 기반 회원가입/로그인 | [결정] |
| API rate limiting | 초기 미적용, 추후 결정 | [결정] |
| 테스트 전략 | Unit / Integration / E2E (3계층) | [결정] |
| 공유 타입 관리 | 공유 디렉터리 방식 (초기) | 가정 |
| 이메일 인증 포함 | 회원가입 시 이메일 확인 포함 | 가정 |
| 생성 큐 | BullMQ + Redis, 사용자당 1건 동시 제한 | 가정 |
| 로그 수집 | CloudWatch Logs (초기) | 가정 |
| 스테이징 환경 | AWS 별도 인프라 | 가정 |
