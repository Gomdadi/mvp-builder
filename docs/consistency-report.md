# 문서 정합성 검토 리포트

---

## 회차 1 — 2026-03-17

### CP-1. PRD ↔ MVP-scope 기능 범위 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 1-1**: `PRD.md`의 F-08(개발자 옵션)은 **Should-have**로 분류되어 있으나, `MVP-scope.md`의 **In-scope**(F-01~F-08)에 포함되어 있다.
  - 영향 범위: PRD 기준으로는 F-08이 없어도 출시 가능하나, MVP-scope 기준으로는 필수 구현 대상이다. 구현 우선순위 결정 시 혼란이 발생할 수 있다.
  - 권장 조치: PRD의 F-08을 Must-have로 격상하거나, MVP-scope In-scope의 F-08 포함 근거를 PRD에 명시한다.

- **이슈 1-2**: `PRD.md` 성능 목표 "MVP 생성 전체 소요 시간 평균 3분 이내"와 `MVP-scope.md` 가설 2의 "3~10분의 대기 시간" 표현이 상이하다.
  - 영향 범위: 개발팀이 생성 소요 시간 목표를 3분으로 볼 것인지, 10분으로 볼 것인지 불명확하다. KPI 설정에도 영향이 있다.
  - 권장 조치: PRD의 "평균 3분 이내"를 기준으로 통일하고, MVP-scope의 가설 2 설명을 "평균 3분(최대 10분 허용)"과 같이 수정하거나 가설 2 문구를 PRD 성능 목표와 일치시킨다.

---

### CP-2. PRD/MVP-scope ↔ tech-stack 기술 스택 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 2-1**: `PRD.md` 7절 GitHub repo 네이밍 규칙에서 `mvp-{keyword}-{userEmail}` 형식을 명시하고 있으나, `tech-stack.md` 4절에서 `mvp-{keyword}-{username}` 형식으로 변경되었다 (tech-stack에 "(이전 결정에서 변경)" 메모 포함). PRD에 이 변경이 반영되지 않았다.
  - 영향 범위: PRD를 기반으로 작업하는 팀원이 이메일 기반 repo 네이밍을 구현할 수 있다. 실제 GitHub repo명과 문서가 불일치하게 된다.
  - 권장 조치: `PRD.md` 7절의 repo 네이밍 규칙을 `mvp-{keyword}-{username}` 형식으로 수정하고, 변경 이유를 명시한다.

---

### CP-3. PRD/MVP-scope ↔ system-architecture 컴포넌트 완전성

**결과**: [이상 없음]

PRD Must-have F-01~F-07 및 MVP-scope In-scope F-08 모두 system-architecture 컴포넌트(AuthModule, GenerationModule, AgentModule, GithubModule, SseModule 등)에 반영되어 있다. PRD 보안 요구사항(JWT, bcrypt, HTTPS, 환경 변수 관리, 입력 검증, 코드 실행 격리)이 system-architecture 5절에 구체적으로 명시되어 있다. PRD 확장성 요구사항(BullMQ + Redis 큐, Docker 컨테이너)이 인프라 컴포넌트에 반영되어 있다.

---

### CP-4. tech-stack ↔ system-architecture 구현 일치

**결과**: [이상 없음]

tech-stack에 정의된 모든 주요 라이브러리(Prisma, BullMQ, @nestjs/jwt, @octokit/rest, @anthropic-ai/sdk, TanStack Query, Zustand, shadcn/ui 등)가 system-architecture 컴포넌트 목록에서 역할이 부여되어 있다. 버전 정보(Node.js 20 LTS, NestJS 10, PostgreSQL 16, Redis 7, React 18, TypeScript 5)가 두 문서에서 일치한다.

---

### CP-5. ERD ↔ API spec 데이터 모델 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 5-1**: `erd.md`의 `generations.status` CONSTRAINT에는 `pending | processing | completed | failed | timeout` 5개 값이 정의되어 있으나, `api-spec.md`의 `GET /generation` Query Parameter `status` 허용값에는 `timeout`이 누락되어 있다 (`pending | processing | completed | failed` 4개만 명시).
  - 영향 범위: 사용자가 `status=timeout`으로 필터링할 수 없게 된다. 타임아웃으로 실패한 생성 이력을 필터링하는 기능이 누락된다.
  - 권장 조치: `api-spec.md`의 `GET /generation` Query Parameter `status` 허용값에 `timeout`을 추가한다.

- **이슈 5-2**: `erd.md`의 `refresh_tokens.token_hash` 컬럼 설명에서 "발급된 Refresh Token의 해시값 (SHA-256)"으로 DB에 해시값을 저장한다고 명시되어 있으나, `system-architecture.md` 5.2절 민감 데이터 처리 테이블에서 Refresh Token 처리 방식을 "DB 저장 시 평문"으로 기술하고 있다.
  - 영향 범위: 개발자가 두 문서 중 어떤 것을 기준으로 구현할지 모호하다. 보안 처리 방식의 불일치는 실제 구현에서 보안 취약점으로 이어질 수 있다.
  - 권장 조치: `system-architecture.md` 5.2절의 Refresh Token 처리 방식 설명을 ERD와 일치하도록 "DB 저장 시 SHA-256 해시값으로 저장. 검증 시 쿠키 값을 해싱해서 비교"로 수정한다.

---

### CP-6. ERD ↔ KPI 측정 가능성

**결과**: [이상 없음]

KPI 산출식에서 참조하는 모든 컬럼(`generations.status`, `generations.created_at`, `generations.completed_at`, `generations.user_id`, `users.is_email_verified`)이 ERD에 존재한다. 테이블명(`generations`, `users`)이 일치한다. KPI-S-01의 "이탈 감지" 방식은 SSE 연결 로그와 DB를 조합하므로 ERD 설계상 측정 가능하다.

---

### CP-7. API spec ↔ wireframe/user-flow 화면-API 연결 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 7-1**: `user-flow.md` CF-01(공통 플로우)에서 "로컬 스토리지에 Access Token 존재?" 여부를 확인하는 흐름으로 설명하고 있으나, `system-architecture.md` 5.1절에서 Access Token은 "메모리(Zustand store)에만 저장. LocalStorage 미사용"으로 명시하고 있다.
  - 영향 범위: Frontend 개발자가 Access Token 저장 위치를 LocalStorage로 구현하면 XSS 취약점이 발생한다. 인증 흐름 구현에서 보안 오류로 이어질 수 있다.
  - 권장 조치: `user-flow.md` CF-01의 "로컬 스토리지에 Access Token 존재?" 표현을 "메모리(Zustand store)에 Access Token 존재?" 또는 "Access Token 메모리 상태 확인"으로 수정한다.

- **이슈 7-2**: `wireframe.md` S-08(생성 완료 화면)의 와이어프레임 예시에서 저장소 이름이 `mvp-reservation-user@example.com`(이메일 기반)으로 표시되어 있으나, `tech-stack.md`에서 결정한 실제 형식은 `mvp-{keyword}-{username}`이다.
  - 영향 범위: 와이어프레임을 참조하는 팀원이 이메일 기반 repo명이 맞다고 오해할 수 있다.
  - 권장 조치: `wireframe.md` S-08 예시의 저장소 이름을 `mvp-reservation-john-doe`(username 기반) 형식으로 수정한다.

---

### CP-8. wireframe ↔ user-flow 화면 전환 일치

**결과**: [이상 없음]

wireframe S-01~S-10 모든 화면이 user-flow 시나리오(SC-01~SC-05, CF-01~CF-02)에서 참조되고 있다. 화면 간 이동 관계(S-09에서 진행 중 항목 → S-07, S-04 실패 → S-03 재발송 등)가 user-flow 엣지 케이스 처리와 일치한다. URL 경로(`/`, `/register`, `/login`, `/history`, `/history/:jobId`)가 두 문서에서 일치한다.

---

### CP-9. user-persona ↔ user-flow 페르소나 일관성

**결과**: [누락]

**발견된 이슈**:

- **이슈 9-1**: `user-persona.md`의 김현우(페르소나 3) 핵심 시나리오 2에서 "생성된 저장소를 clone해 파일 구조와 모듈 분리 방식을 확인"하는 시나리오가 정의되어 있으나, `user-flow.md`에서 이 시나리오에 해당하는 플로우(생성 상세 페이지에서 파일 구조 확인)가 명시적으로 포함되지 않았다. SC-03 종료 후 로컬 실행까지만 포함되어 있다.
  - 영향 범위: 시니어 개발자 페르소나의 핵심 사용 패턴이 user-flow에 반영되지 않아, 해당 페르소나를 위한 UX 설계가 누락될 수 있다. 단, MVP-scope에서 파일 트리 미리보기(F-10)가 Out-of-scope이므로 현재 MVP에서는 허용 가능한 범위일 수 있다.
  - 권장 조치: user-flow에 주석 또는 엣지 케이스 항목으로 "파일 트리 미리보기는 v1.1 구현 예정으로 현재 MVP에서는 clone 후 로컬에서 확인"임을 명시한다. (확인 필요)

---

### CP-10. PRD/MVP-scope ↔ KPI 목표 수치 일치

**결과**: [누락]

**발견된 이슈**:

- **이슈 10-1**: `PRD.md` 성능 목표 "생성 시작 후 첫 SSE 이벤트 도달 3초 이내(C-UX-11)"가 `kpi.md`의 KPI 항목에 직접 측정 지표로 포함되지 않았다. `operations-guide.md`에서는 TTF(Time to First Event) 모니터링을 언급하나, KPI 문서에서 해당 항목이 누락되었다.
  - 영향 범위: SSE 응답 속도가 KPI로 추적되지 않으면, 해당 성능 목표 달성 여부를 정기적으로 검증할 수 없다.
  - 권장 조치: `kpi.md`에 KPI-S-06으로 "첫 SSE 이벤트 도달 시간(P95 3초 이내)"을 추가하거나, KPI-S-03 평균 생성 소요 시간 측정 항목에 TTF 측정을 포함한다.

- **이슈 10-2**: `MVP-scope.md` 가설 3 검증 기준 "테스트 사용자 만족도 70% 이상 (생성 결과물을 실제 사용하거나 수정 의향 있음)"에 직접 대응하는 KPI 항목이 없다. KPI-S-05(NPS 30 이상)는 간접 지표이며, "사용 또는 수정 의향" 기준은 별도 측정 방법이 필요하다.
  - 영향 범위: 가설 3 검증이 공식 KPI 추적 없이는 어렵다. MVP 성공 판단 기준에 가설 3이 포함되지 못한다.
  - 권장 조치: `kpi.md`의 정성적 성공 지표 또는 NPS 측정에 "결과물 사용 또는 수정 의향(5점 척도 4점 이상을 만족으로 간주)" 항목을 추가하여 가설 3과 연결한다.

---

### CP-11. operations-guide ↔ system-architecture/tech-stack 운영 일치

**결과**: [이상 없음]

operations-guide의 Runbook 001~005가 system-architecture의 핵심 컴포넌트(NestJS, PostgreSQL, Redis, Claude API, GitHub API, Gmail SMTP)를 모두 다루고 있다. 환경 변수 목록은 tech-stack의 기본 목록을 포함하면서 운영에 필요한 추가 항목(`PORT`, `FRONTEND_URL`, `EMAIL_VERIFICATION_EXPIRES_HOURS`, `GENERATION_TIMEOUT_MINUTES`, `BULLMQ_CONCURRENCY`)을 확장한 것으로, 상충하지 않는다. 배포 절차(GitHub Actions, Docker, Prisma migrate)가 tech-stack의 CI/CD 구성과 일치한다. constitution C-INFRA-08(3개 환경 분리) 원칙 대비 MVP-scope 결정에 따라 초기 2환경 운영이 operations-guide에 명시되어 있어 일관성이 있다.

---

### CP-12. operations-guide ↔ KPI 측정-모니터링 연결

**결과**: [누락]

**발견된 이슈**:

- **이슈 12-1**: `kpi.md`에서 KPI-P-02(clone URL 클릭률) 및 KPI-S-04(회원가입 완료율) 측정 도구로 **GA4(Google Analytics 4)**를 명시하고 있으나, `operations-guide.md`의 모니터링 섹션에 GA4 관련 설정 또는 운영 고려사항이 전혀 포함되어 있지 않다.
  - 영향 범위: GA4 태깅 누락 시 핵심 비즈니스 KPI를 측정할 수 없다. 운영 팀이 GA4가 모니터링 스택에 포함되어 있다는 사실을 인지하지 못할 수 있다.
  - 권장 조치: `operations-guide.md` 1.3 알림 채널 섹션 또는 신규 "1.4 분석 도구" 섹션에 GA4 운영 관련 항목(태깅 확인, 이벤트 수집 상태 점검 등)을 추가한다.

- **이슈 12-2**: `kpi.md`의 실패 신호 중 "생성 대기 이탈률 60% 초과"가 operations-guide의 비즈니스 메트릭 알림(1.2절)에 포함되어 있지 않다.
  - 영향 범위: KPI Kill 기준 중 하나인 이탈률 급증을 operations-guide 기준으로는 알림이 발동하지 않는다.
  - 권장 조치: `operations-guide.md` 1.2 비즈니스 메트릭 알림에 "생성 대기 이탈률 60% 초과 (주간 기준)" 항목을 추가한다.

---

### CP-13. constitution 보안 원칙 ↔ API spec/ERD/system-architecture 준수

**결과**: [누락]

**발견된 이슈**:

- **이슈 13-1**: `constitution.md` **C-SEC-08** "GitHub token은 DB 저장 시 AES-256으로 암호화"라고 명시되어 있으나, 실제 설계(`system-architecture.md`, `erd.md`)에서는 GitHub token을 사용자가 등록하는 것이 아니라 운영자 소유 token을 환경 변수로만 관리하는 방식으로 결정되었다. 이 설계 변경이 constitution에 반영되지 않았다.
  - 영향 범위: constitution을 읽은 개발자가 ERD에 GitHub token 암호화 저장 컬럼을 추가하려 할 수 있다. 불필요한 구현으로 이어질 수 있다.
  - 권장 조치: `constitution.md` C-SEC-08의 내용을 "운영자 소유 GitHub token은 환경 변수(AWS Secrets Manager)로만 관리하며 DB에 저장하지 않는다"로 수정하거나, 가정 메모를 실제 결정 내용으로 업데이트한다.

- **이슈 13-2**: `system-architecture.md`의 보안 고려사항(5절)이 constitution의 보안 원칙 ID(C-SEC-*)를 일부만 참조하고 있다. 5.3절에서 C-SEC-09, C-SEC-10, C-SEC-11만 명시적으로 참조하고, C-SEC-01~C-SEC-08, C-SEC-12~C-SEC-15는 내용적으로는 반영되어 있으나 ID가 명시되어 있지 않다.
  - 영향 범위: 감사(audit) 또는 코드 리뷰 시 constitution의 특정 보안 원칙이 system-architecture에 반영되었는지 추적이 어렵다.
  - 권장 조치: `system-architecture.md` 5절의 각 보안 항목에 해당하는 constitution ID를 추가한다. (확인 필요)

---

### 요약

| 체크포인트 | 결과 | 이슈 수 |
|-----------|------|---------|
| CP-1. PRD ↔ MVP-scope | [불일치] | 2 |
| CP-2. PRD/MVP-scope ↔ tech-stack | [불일치] | 1 |
| CP-3. PRD/MVP-scope ↔ system-architecture | [이상 없음] | 0 |
| CP-4. tech-stack ↔ system-architecture | [이상 없음] | 0 |
| CP-5. ERD ↔ API spec | [불일치] | 2 |
| CP-6. ERD ↔ KPI | [이상 없음] | 0 |
| CP-7. API spec ↔ wireframe/user-flow | [불일치] | 2 |
| CP-8. wireframe ↔ user-flow | [이상 없음] | 0 |
| CP-9. user-persona ↔ user-flow | [누락] | 1 |
| CP-10. PRD/MVP-scope ↔ KPI | [누락] | 2 |
| CP-11. operations-guide ↔ system-architecture/tech-stack | [이상 없음] | 0 |
| CP-12. operations-guide ↔ KPI | [누락] | 2 |
| CP-13. constitution 보안 원칙 ↔ API spec/ERD/architecture | [누락] | 2 |

**총 이슈**: 14건 (불일치 7 / 누락 7 / 모순 0)

**상태**: 수정 완료

---

### 수정 결과 (7-doc-consistency-fixer)

| 이슈 ID | 분류 | 수정 대상 파일 | 처리 결과 |
|---------|------|---------------|-----------|
| 이슈 1-1 | [불일치] | `docs/PRD.md` | 수정 완료 — F-08을 Should-have에서 Must-have로 격상, MVP-scope In-scope(F-01~F-08)와 일치 |
| 이슈 1-2 | [불일치] | `docs/MVP-scope.md` | 수정 완료 — 가설 2 대기 시간 표현을 "평균 3분(최대 10분 허용)"으로 PRD 성능 목표와 일치 |
| 이슈 2-1 | [불일치] | `docs/PRD.md`, `docs/MVP-scope.md` | 수정 완료 — repo 네이밍 규칙을 `mvp-{keyword}-{username}`으로 통일 (변경 이유 명시 포함) |
| 이슈 5-1 | [불일치] | `docs/api-spec.md` | 수정 완료 — `GET /generation` status 필터에 `timeout` 추가 |
| 이슈 5-2 | [불일치] | `docs/system-architecture.md` | 수정 완료 — 5.2절 Refresh Token 처리 방식을 "DB 저장 시 SHA-256 해시값으로 저장. 검증 시 쿠키 값을 해싱해서 비교"로 수정 |
| 이슈 7-1 | [불일치] | `docs/user-flow.md` | 수정 완료 — CF-01의 "로컬 스토리지에 Access Token 존재?" → "메모리(Zustand store)에 Access Token 존재?"로 수정 |
| 이슈 7-2 | [불일치] | `docs/wireframe.md` | 수정 완료 — S-08, S-09, S-10 저장소 이름 예시를 `mvp-reservation-john-doe` (username 기반)으로 수정 |
| 이슈 9-1 | [누락] | `docs/user-flow.md` | 수정 완료 — SC-03 하단에 파일 트리 미리보기 v1.1 예정 안내 주석 추가 |
| 이슈 10-1 | [누락] | `docs/kpi.md` | 수정 완료 — KPI-S-06 "첫 SSE 이벤트 도달 시간(P95 3초 이내)" 항목 및 측정 계획 추가 |
| 이슈 10-2 | [누락] | `docs/kpi.md` | 수정 완료 — 정성적 성공 지표 섹션에 가설 3 검증 지표(결과물 사용/수정 의향 5점 척도) 추가 |
| 이슈 12-1 | [누락] | `docs/operations-guide.md` | 수정 완료 — 1.4 분석 도구(GA4) 섹션 신설. 이벤트 수집, 퍼널 데이터, 데이터 스트림 점검 항목 포함 |
| 이슈 12-2 | [누락] | `docs/operations-guide.md` | 수정 완료 — 1.2 비즈니스 메트릭 알림에 "생성 대기 이탈률 60% 초과(주간 기준)" 항목 추가 |
| 이슈 13-1 | [누락] | `docs/constitution.md` | 수정 완료 — C-SEC-08을 "운영자 소유 GitHub token은 환경 변수(AWS Secrets Manager)로만 관리, DB 미저장"으로 업데이트 |
| 이슈 13-2 | [누락] | `docs/system-architecture.md` | 수정 완료 — 5절 각 보안 항목에 C-SEC-01~C-SEC-15 참조 ID 추가 |

**미처리 이슈**: 0건

**다음 단계**: `6-doc-consistency-checker`를 재실행하여 잔여 이슈를 확인하세요.

---

## 회차 2 — 2026-03-17

> 이전 회차 이슈 중 수정된 항목: 이슈 1-1, 1-2, 2-1, 5-1, 5-2, 7-1, 7-2, 9-1, 10-1, 10-2, 12-1, 12-2, 13-1, 13-2 (14건 전체)
> 이번 회차 신규 이슈: 4건

---

### CP-1. PRD ↔ MVP-scope 기능 범위 일치

**결과**: [이상 없음]

회차 1 이슈 1-1(F-08 Must-have 격상), 이슈 1-2(가설 2 대기 시간 표현 통일) 수정 반영 확인. PRD Must-have F-01~F-08이 MVP-scope In-scope F-01~F-08과 1:1 대응. MVP-scope Out-of-scope(F-09~F-15)가 PRD Should-have/Nice-to-have와 버전 매핑 일치. PRD 성능 목표 "평균 3분 이내"와 MVP-scope 가설 2 "평균 3분(최대 10분 허용)" 표현 일치. PRD 비기능 요구사항(JWT, bcrypt, Docker, BullMQ)이 MVP-scope 출시 전제 조건에 반영되어 있다.

---

### CP-2. PRD/MVP-scope ↔ tech-stack 기술 스택 일치

**결과**: [누락]

**발견된 이슈**:

- **이슈 2-2**: `tech-stack.md` 6절 환경 변수 목록에는 `PORT`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `FRONTEND_URL` 항목이 없으나, `operations-guide.md` 3.1절 Backend 환경 변수 목록에는 이 4개 항목이 포함되어 있다. 반대로 `tech-stack.md`에는 `APP_URL`이 있으나 `operations-guide.md`에도 `APP_URL`이 있어 중복 관리되고 있다. 두 문서가 서로 다른 환경 변수 목록을 권위(canonical) 문서로 삼고 있어 어느 쪽을 따라야 하는지 불명확하다.
  - 영향 범위: 개발자가 `tech-stack.md`를 참조하여 `.env.example`을 작성할 경우 `PORT`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `FRONTEND_URL`이 누락된 설정 파일이 생성된다.
  - 권장 조치: `tech-stack.md` 6절에 누락된 4개 항목(`PORT`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `FRONTEND_URL`)을 추가하거나, `tech-stack.md`에 "완전한 환경 변수 목록은 `operations-guide.md` 3절을 참조"라는 안내를 추가한다.

---

### CP-3. PRD/MVP-scope ↔ system-architecture 컴포넌트 완전성

**결과**: [이상 없음]

회차 1 수정 사항(C-SEC-* ID 참조 추가) 반영 확인. PRD Must-have 기능(F-01~F-08) 전체가 system-architecture 컴포넌트에 반영되어 있다. PRD 보안 요구사항 및 확장성 요구사항이 5절 보안 고려사항과 인프라 컴포넌트에 구체적으로 명시되어 있다.

---

### CP-4. tech-stack ↔ system-architecture 구현 일치

**결과**: [이상 없음]

tech-stack에 정의된 모든 라이브러리가 system-architecture 컴포넌트에 역할이 부여되어 있다. 버전 정보가 일치한다. 회차 1 수정(Refresh Token SHA-256 처리 방식)이 system-architecture 5.2절에 반영되어 있으며 ERD와 일치한다.

---

### CP-5. ERD ↔ API spec 데이터 모델 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 5-3**: `api-spec.md`의 SSE 이벤트 정의에서 `error` 이벤트 payload 예시에 `"code":"GEN_005"` 값이 사용되고 있으나, 같은 문서 3.3절 도메인별 에러 코드 정의에는 `GEN_001`~`GEN_004`까지만 정의되어 있다. `GEN_005`는 정의되지 않은 코드다.
  - 영향 범위: Frontend 개발자가 `GEN_005` 코드에 대한 에러 처리 로직을 작성할 때 공식 정의가 없어 처리 방식이 불명확하다. 또한 `GEN_005`가 어떤 의미인지 알 수 없다.
  - 권장 조치: `api-spec.md` 3.3절에 `GEN_005` 에러 코드를 추가하고 의미를 정의한다(예: "코드 생성 중 내부 오류"). 또는 `error` 이벤트 예시에서 `GEN_005`를 기존 정의된 코드 중 적절한 것으로 교체한다.

- **이슈 5-4**: 회차 1 이슈 5-1에서 `GET /generation` Query Parameter `status`에 `timeout`이 추가되었으나, 같은 API의 Response 200 예시 `data` 배열에 `status` 가능 값 설명이 없어 응답에서의 `timeout` 값 포함 여부가 불명확하다. 단, 이는 예시 데이터가 아닌 스펙 기술 방식의 문제이므로 표현 수준의 누락으로 처리한다.
  - 영향 범위: 낮음. `status` 필터에 `timeout`이 추가되어 있으므로 응답 데이터에 포함됨을 추론할 수 있다.
  - 권장 조치: `GET /generation` Response 200의 `data` 항목 설명에 `status` 가능 값(`pending | processing | completed | failed | timeout`)을 명시하거나, `GET /generation/:jobId` Response에 `status` 가능 값 목록을 추가한다.

---

### CP-6. ERD ↔ KPI 측정 가능성

**결과**: [이상 없음]

회차 1에서 추가된 KPI-S-06(첫 SSE 이벤트 도달 시간) 측정 방식이 `generations.created_at`과 서버 로그 기반 TTF 측정을 사용하므로 ERD 설계와 충돌하지 않는다. 모든 KPI 산출식 참조 컬럼이 ERD에 존재한다.

---

### CP-7. API spec ↔ wireframe/user-flow 화면-API 연결 일치

**결과**: [이상 없음]

회차 1 이슈 7-1(CF-01 Access Token 저장 위치 수정), 이슈 7-2(wireframe 저장소 이름 예시 수정) 반영 확인. `user-flow.md` CF-01의 "메모리(Zustand store)에 Access Token 존재?" 표현이 `system-architecture.md` 5.1절과 일치한다. `wireframe.md` S-08, S-09, S-10의 저장소 이름 예시(`mvp-reservation-john-doe`)가 username 기반 형식을 따르고 있다. wireframe 화면에서 호출하는 API 경로 및 메서드가 api-spec.md 정의와 일치한다.

---

### CP-8. wireframe ↔ user-flow 화면 전환 일치

**결과**: [이상 없음]

wireframe S-01~S-10 모든 화면이 user-flow 시나리오에서 참조된다. 화면 전환 경로와 URL이 일치한다. 모달(이탈 경고) 및 에러 상태가 두 문서에서 동일하게 정의되어 있다. `wireframe.md`의 S-04 URL `/auth/verify-email?token=...`가 `api-spec.md` `GET /auth/verify-email` 엔드포인트와 일치한다.

---

### CP-9. user-persona ↔ user-flow 페르소나 일관성

**결과**: [이상 없음]

회차 1 이슈 9-1 수정 확인. `user-flow.md` SC-03 하단에 파일 트리 미리보기 v1.1 예정 및 현재 MVP에서는 clone 후 로컬 확인 방식 안내가 추가되어 있다. user-flow에 등장하는 페르소나명(박지수, 이태양, 김현우)이 user-persona 정의와 일치한다. SC-02가 박지수의 핵심 시나리오 1과, SC-03이 이태양/김현우의 핵심 시나리오 1과 대응된다. SC-04가 박지수의 핵심 시나리오 2(이력 재확인)와 대응된다.

---

### CP-10. PRD/MVP-scope ↔ KPI 목표 수치 일치

**결과**: [이상 없음]

회차 1 이슈 10-1(KPI-S-06 추가), 이슈 10-2(가설 3 검증 지표 추가) 수정 확인. PRD 성능 목표 수치(평균 3분 이내, P95 3초 이내)가 KPI-S-03(P50 3분 이하), KPI-S-06(P95 3초 이내)에 반영되어 있다. MVP-scope 가설 1~3 검증 기준이 KPI-P-01(90%), KPI-S-01(30% 미만), KPI-S-05 및 가설 3 검증 지표(70% 이상)와 연결되어 있다. MVP-scope 출시 전제 조건 항목들이 KPI 또는 체크리스트에서 추적 가능하다.

---

### CP-11. operations-guide ↔ system-architecture/tech-stack 운영 일치

**결과**: [누락]

**발견된 이슈**:

- **이슈 11-1**: `operations-guide.md` 1.4절에서 GA4 운영을 위해 "`VITE_GA4_MEASUREMENT_ID` 환경 변수로 Measurement ID를 주입한다"고 명시되어 있으나, 같은 문서 3.2절 Frontend 환경 변수 목록에 `VITE_GA4_MEASUREMENT_ID`가 포함되어 있지 않다. `VITE_API_BASE_URL`만 목록에 존재한다.
  - 영향 범위: 운영자가 3.2절 환경 변수 목록을 기준으로 `.env.example`을 구성하면 GA4 측정 ID가 누락된다. GA4 이벤트가 수집되지 않아 KPI-P-02, KPI-S-04 측정이 불가능해진다.
  - 권장 조치: `operations-guide.md` 3.2절 Frontend 환경 변수 목록에 `VITE_GA4_MEASUREMENT_ID` 항목을 추가한다.

---

### CP-12. operations-guide ↔ KPI 측정-모니터링 연결

**결과**: [이상 없음]

회차 1 이슈 12-1(GA4 운영 1.4절 추가), 이슈 12-2(생성 대기 이탈률 알림 추가) 수정 확인. `kpi.md`의 GA4 측정 도구가 `operations-guide.md` 1.4절에 반영되어 있다. KPI Kill 기준인 "생성 대기 이탈률 60% 초과"가 1.2절 비즈니스 메트릭 알림에 포함되어 있다. `operations-guide.md` 4.1절 백업 대상이 ERD의 4개 테이블(`users`, `email_verification_tokens`, `refresh_tokens`, `generations`)을 명시적으로 포함하고 있다.

---

### CP-13. constitution 보안 원칙 ↔ API spec/ERD/system-architecture 준수

**결과**: [이상 없음]

회차 1 이슈 13-1(C-SEC-08 내용 수정), 이슈 13-2(system-architecture 5절 C-SEC ID 추가) 수정 확인. `constitution.md` C-SEC-08이 "운영자 소유 GitHub token은 환경 변수(AWS Secrets Manager)로만 관리하고 DB에 저장하지 않는다"로 업데이트되어 `system-architecture.md` 5.2절, `erd.md` 설계와 일치한다. `system-architecture.md` 5.1절에 C-SEC-01~C-SEC-05, 5.2절에 C-SEC-06/08/05/07/03, 5.3절에 C-SEC-09/10/11, 5.4절에 C-SEC-12/04/15가 참조되어 있다. API spec의 인증 필요 엔드포인트에 `Authorization: Bearer Token` 헤더가 명시되어 있다.

---

### 요약

| 체크포인트 | 결과 | 이슈 수 |
|-----------|------|---------|
| CP-1. PRD ↔ MVP-scope | [이상 없음] | 0 |
| CP-2. PRD/MVP-scope ↔ tech-stack | [누락] | 1 |
| CP-3. PRD/MVP-scope ↔ system-architecture | [이상 없음] | 0 |
| CP-4. tech-stack ↔ system-architecture | [이상 없음] | 0 |
| CP-5. ERD ↔ API spec | [불일치] | 2 |
| CP-6. ERD ↔ KPI | [이상 없음] | 0 |
| CP-7. API spec ↔ wireframe/user-flow | [이상 없음] | 0 |
| CP-8. wireframe ↔ user-flow | [이상 없음] | 0 |
| CP-9. user-persona ↔ user-flow | [이상 없음] | 0 |
| CP-10. PRD/MVP-scope ↔ KPI | [이상 없음] | 0 |
| CP-11. operations-guide ↔ system-architecture/tech-stack | [누락] | 1 |
| CP-12. operations-guide ↔ KPI | [이상 없음] | 0 |
| CP-13. constitution 보안 원칙 ↔ API spec/ERD/architecture | [이상 없음] | 0 |

**총 이슈**: 4건 (불일치 2 / 누락 2 / 모순 0)

**상태**: 수정 완료

---

### 수정 결과 (7-doc-consistency-fixer)

| 이슈 ID | 분류 | 수정 대상 파일 | 처리 결과 |
|---------|------|---------------|-----------|
| 이슈 2-2 | [누락] | `docs/tech-stack.md` | 수정 완료 — 6절에 `PORT`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `FRONTEND_URL` 4개 환경 변수 추가 |
| 이슈 5-3 | [불일치] | `docs/api-spec.md` | 수정 완료 — 3.3절에 `GEN_005` 에러 코드 추가 (Claude API / 파이프라인 내부 오류, HTTP 500) |
| 이슈 5-4 | [불일치] | `docs/api-spec.md` | 수정 완료 — `GET /generation` 응답 예시 하단에 `data[].status` 가능 값(`pending \| processing \| completed \| failed \| timeout`) 명시 |
| 이슈 11-1 | [누락] | `docs/operations-guide.md` | 수정 완료 — 3.2절 Frontend 환경 변수에 `VITE_GA4_MEASUREMENT_ID` 항목 추가 |

**미처리 이슈**: 0건

**다음 단계**: `6-doc-consistency-checker`를 재실행하여 잔여 이슈를 확인하세요.

---

## 회차 3 — 2026-03-17

> 이전 회차 이슈 중 수정된 항목: 이슈 2-2, 5-3, 5-4, 11-1 (4건 전체)
> 이번 회차 신규 이슈: 0건

---

### CP-1. PRD ↔ MVP-scope 기능 범위 일치

**결과**: [이상 없음]

PRD Must-have F-01~F-08이 MVP-scope In-scope F-01~F-08과 1:1 대응 유지. MVP-scope Out-of-scope(F-09~F-15)가 PRD Should-have/Nice-to-have 버전 매핑과 일치. PRD 성능 목표 "평균 3분 이내"와 MVP-scope 가설 2 "평균 3분(최대 10분 허용)" 표현 일치 유지. 회차 2 수정 사항이 모두 유지되고 있다. 추가 이슈 없음.

---

### CP-2. PRD/MVP-scope ↔ tech-stack 기술 스택 일치

**결과**: [이상 없음]

회차 2 이슈 2-2 수정 확인. `tech-stack.md` 6절에 `PORT`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `FRONTEND_URL` 4개 항목이 추가되어 `operations-guide.md` 3.1절과 일치한다. 두 문서의 환경 변수 목록이 정합적으로 유지된다. repo 네이밍 규칙 `mvp-{keyword}-{username}`이 `tech-stack.md` 4절, `PRD.md` 7절, `MVP-scope.md` F-04에서 모두 일치한다. 추가 이슈 없음.

---

### CP-3. PRD/MVP-scope ↔ system-architecture 컴포넌트 완전성

**결과**: [이상 없음]

PRD Must-have 기능(F-01~F-08) 전체가 system-architecture 컴포넌트에 반영되어 있다. PRD 보안 요구사항 및 확장성 요구사항이 5절 보안 고려사항과 인프라 컴포넌트에 구체적으로 명시되어 있다. C-SEC-* ID 참조가 5절 전체에 추가되어 있어 추적 가능성이 확보되어 있다. 추가 이슈 없음.

---

### CP-4. tech-stack ↔ system-architecture 구현 일치

**결과**: [이상 없음]

tech-stack에 정의된 모든 라이브러리(Prisma, BullMQ, @nestjs/jwt, @octokit/rest, @anthropic-ai/sdk, TanStack Query, Zustand, shadcn/ui, React Hook Form, zod 등)가 system-architecture 컴포넌트에서 역할이 부여되어 있다. 버전 정보(Node.js 20 LTS, NestJS 10, PostgreSQL 16, Redis 7, React 18, TypeScript 5)가 일치한다. Refresh Token SHA-256 처리 방식이 두 문서에서 일치한다. 추가 이슈 없음.

---

### CP-5. ERD ↔ API spec 데이터 모델 일치

**결과**: [이상 없음]

회차 2 이슈 5-3(`GEN_005` 에러 코드 추가), 이슈 5-4(`GET /generation` 응답 `data[].status` 가능 값 명시) 수정 확인. `api-spec.md` 3.3절에 `GEN_005`(Claude API / 파이프라인 내부 오류, HTTP 500)가 정의되어 있어 SSE `error` 이벤트 payload의 `code` 값과 일치한다. `GET /generation` 응답 주석에 `data[].status` 가능 값이 ERD `generations.status` CONSTRAINT와 동일하게 명시되어 있다. `GET /generation/:jobId` 응답 예시의 `status` 필드도 동일한 값 집합을 사용함을 확인할 수 있다. ERD `current_stage` CONSTRAINT 허용값(`analyzing | documenting | developing | testing | uploading`)이 API spec SSE `stage` 값 정의와 일치한다. 추가 이슈 없음.

---

### CP-6. ERD ↔ KPI 측정 가능성

**결과**: [이상 없음]

KPI-P-01 산출식(`generations.status`)이 ERD `generations` 테이블에 존재한다. KPI-S-03 산출식(`completed_at - created_at`)이 ERD 컬럼에 존재한다. KPI-S-06(TTF 측정)은 서버 로그 기반으로 측정하며 ERD 설계와 충돌하지 않는다. KPI-S-04 측정(`users.is_email_verified`)이 ERD `users` 테이블에 존재한다. 추가 이슈 없음.

---

### CP-7. API spec ↔ wireframe/user-flow 화면-API 연결 일치

**결과**: [이상 없음]

`user-flow.md` CF-01의 "메모리(Zustand store)에 Access Token 존재?" 표현이 `system-architecture.md` 5.1절 및 `api-spec.md` 2.1절과 일치 유지. `wireframe.md` S-08, S-09, S-10의 저장소 이름 예시(`mvp-reservation-john-doe`)가 `tech-stack.md` 4절 네이밍 규칙과 일치 유지. wireframe 화면에서 호출하는 API 경로(`POST /generation`, `GET /generation/:jobId/stream`, `GET /generation`, `GET /generation/:jobId`)가 api-spec.md 정의와 일치. user-flow 에러 코드(`409 GEN_001`, `400 GEN_003`, `404 GEN_002`, `403` 등)가 api-spec.md 3.3절 에러 코드와 일치한다. 추가 이슈 없음.

---

### CP-8. wireframe ↔ user-flow 화면 전환 일치

**결과**: [이상 없음]

wireframe S-01~S-10 모든 화면이 user-flow 시나리오(SC-01~SC-05, CF-01~CF-02)에서 참조되고 있다. 화면 전환 경로(S-07 → S-08 완료, S-07 → 에러 상태, S-07 이탈 → 모달 등)가 두 문서에서 일치한다. URL 경로(`/`, `/register`, `/register/verify`, `/auth/verify-email?token=...`, `/login`, `/history`, `/history/:jobId`)가 일치한다. 추가 이슈 없음.

---

### CP-9. user-persona ↔ user-flow 페르소나 일관성

**결과**: [이상 없음]

페르소나명(박지수, 이태양, 김현우)이 user-persona 정의와 일치한다. SC-03 하단에 "파일 트리 미리보기(F-10)는 Out-of-scope(v1.1 예정), 현재 MVP에서는 clone 후 로컬에서 직접 확인" 안내가 명시되어 있어 페르소나 3(김현우)의 핵심 시나리오 2와의 관계가 문서화되어 있다. SC-02가 박지수 시나리오 1, SC-03이 이태양/김현우 시나리오 1, SC-04가 박지수 시나리오 2에 각각 대응된다. 추가 이슈 없음.

---

### CP-10. PRD/MVP-scope ↔ KPI 목표 수치 일치

**결과**: [이상 없음]

PRD 성능 목표(평균 3분 이내, P95 3초 이내)가 KPI-S-03(P50 3분 이하), KPI-S-06(P95 3초 이내)에 반영되어 있다. MVP-scope 가설 1~3 검증 기준이 KPI-P-01, KPI-S-01, 가설 3 검증 지표에 1:1 대응된다. MVP-scope 출시 전제 조건(F-01~F-08 완성, 보안, 인프라 체크리스트)이 KPI 또는 MVP-scope 체크리스트에서 추적 가능하다. 추가 이슈 없음.

---

### CP-11. operations-guide ↔ system-architecture/tech-stack 운영 일치

**결과**: [이상 없음]

회차 2 이슈 11-1 수정 확인. `operations-guide.md` 3.2절 Frontend 환경 변수 목록에 `VITE_GA4_MEASUREMENT_ID`가 추가되어 1.4절 GA4 운영 안내와 일치한다. Runbook 001~005가 system-architecture의 모든 핵심 컴포넌트(NestJS, PostgreSQL, Redis, Claude API, GitHub API, Gmail SMTP)를 다루고 있다. Backend 환경 변수 목록이 `tech-stack.md` 6절과 일치하고 운영 필요 항목이 추가되어 있다. 배포 절차가 tech-stack CI/CD 구성과 일치한다. 추가 이슈 없음.

---

### CP-12. operations-guide ↔ KPI 측정-모니터링 연결

**결과**: [이상 없음]

`kpi.md`의 GA4 측정 도구가 `operations-guide.md` 1.4절에 반영되어 있다. KPI Kill 기준인 "생성 대기 이탈률 60% 초과"가 1.2절 비즈니스 메트릭 알림에 포함되어 있다. KPI-P-01 실패 신호(생성 성공률 지속 저하)가 1.2절 비즈니스 메트릭 알림("생성 성공률 일간 80% 미만")에 대응된다. `operations-guide.md` 4.1절 백업 대상이 ERD 4개 테이블 전체를 포함하고 있다. 추가 이슈 없음.

---

### CP-13. constitution 보안 원칙 ↔ API spec/ERD/system-architecture 준수

**결과**: [이상 없음]

`constitution.md` C-SEC-08이 "운영자 소유 GitHub token은 환경 변수(AWS Secrets Manager)로만 관리, DB 미저장"으로 업데이트되어 있어 `system-architecture.md` 5.2절, `erd.md` 설계와 일치한다. `system-architecture.md` 5절 전체에 C-SEC-01~C-SEC-15 참조 ID가 추가되어 있다. API spec 인증 필요 엔드포인트에 `Authorization: Bearer Token` 헤더 명시(C-SEC-04). ERD `users.password_hash`가 bcrypt 해싱을 명시(C-SEC-05). `refresh_tokens.token_hash`가 SHA-256 처리를 명시(C-SEC-03). `api-spec.md` 2.1절에 Access Token 만료 15분, Refresh Token 만료 7일이 명시되어 constitution C-SEC-02, C-SEC-03과 일치한다. 추가 이슈 없음.

---

### 요약

| 체크포인트 | 결과 | 이슈 수 |
|-----------|------|---------|
| CP-1. PRD ↔ MVP-scope | [이상 없음] | 0 |
| CP-2. PRD/MVP-scope ↔ tech-stack | [이상 없음] | 0 |
| CP-3. PRD/MVP-scope ↔ system-architecture | [이상 없음] | 0 |
| CP-4. tech-stack ↔ system-architecture | [이상 없음] | 0 |
| CP-5. ERD ↔ API spec | [이상 없음] | 0 |
| CP-6. ERD ↔ KPI | [이상 없음] | 0 |
| CP-7. API spec ↔ wireframe/user-flow | [이상 없음] | 0 |
| CP-8. wireframe ↔ user-flow | [이상 없음] | 0 |
| CP-9. user-persona ↔ user-flow | [이상 없음] | 0 |
| CP-10. PRD/MVP-scope ↔ KPI | [이상 없음] | 0 |
| CP-11. operations-guide ↔ system-architecture/tech-stack | [이상 없음] | 0 |
| CP-12. operations-guide ↔ KPI | [이상 없음] | 0 |
| CP-13. constitution 보안 원칙 ↔ API spec/ERD/architecture | [이상 없음] | 0 |

**총 이슈**: 0건 (불일치 0 / 누락 0 / 모순 0)

**상태**: 완료
