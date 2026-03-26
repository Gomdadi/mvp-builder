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

회차 2 이슈 5-3(`GEN_005` 에러 코드 추가), 이슈 5-4(`GET /generation` 응답 `data[].status` 가능 값 명시) 수정 확인. `api-spec.md` 3.3절에 `GEN_005`(Claude API / 파이프라인 내부 오류, HTTP 500)가 정의되어 있어 SSE `error` 이벤트 payload의 `code` 값과 일치한다. `GET /generation` 응답 주석에 `data[].status` 가능 값이 ERD `generations.status` CONSTRAINT와 동일하게 명시되어 있다. ERD `current_stage` CONSTRAINT 허용값(`analyzing | awaiting_feedback | developing | testing | uploading`)이 API spec SSE `stage` 값 정의와 일치한다. 추가 이슈 없음.

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

---

## 회차 4 — 2026-03-26

> 이전 회차 이슈 중 수정된 항목: 없음 (회차 3에서 이슈 0건으로 완료됨)
> 이번 회차: 사용자 명시 변경사항 8가지 반영 여부 신규 검토 — 신규 이슈 15건

**검토 배경**: 다음 8가지 설계 변경사항이 전체 docs에 반영되어야 하며 정합성을 검토한다.
1. 타겟: 개발자 전용 (비개발자 제거)
2. 인증: GitHub OAuth 단일 로그인 (이메일 인증 제거)
3. 생성 파이프라인: 분석 문서 생성 → 사용자 피드백 → 개발 → 테스트 리포트 → clone URL
4. Generation 상태: `pending | analyzing | awaiting_feedback | developing | testing | uploading | completed | failed | timeout`
5. GitHub: 사용자 계정에 repo 생성 (운영자 계정 아님)
6. GitHub OAuth token: AES-256 암호화 저장
7. Claude API key: MVP는 운영자 소유, 이후 BYOK 예정
8. 오픈소스 공개

---

### CP-1. PRD ↔ MVP-scope 기능 범위 일치

**결과**: [이상 없음]

PRD Must-have F-01~F-08(피드백 루프 포함 F-02a~F-02c)이 MVP-scope In-scope와 1:1 대응 유지. PRD 제품 개요, 사용자 스토리가 개발자 타겟으로 명시되어 있다. 생성 파이프라인(분석 → 피드백 대기 → 개발 → 테스트 → 업로드)이 두 문서에서 일치한다. Generation 상태값(`pending | analyzing | awaiting_feedback | developing | testing | uploading | completed | failed | timeout`) 9개가 PRD 6절에 명시되어 있다. GitHub는 사용자 계정에 repo 생성으로 명시되어 있다. GitHub OAuth token AES-256 암호화, Claude API key 운영자 소유(BYOK 이후) 모두 PRD 4절 보안 요구사항에 반영되어 있다. 추가 이슈 없음.

---

### CP-2. PRD/MVP-scope ↔ tech-stack 기술 스택 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 4-1**: `tech-stack.md` 3절 대안 비교표의 **"이메일 발송"** 섹션에 "Nodemailer + Gmail SMTP: 선택됨"으로 명시되어 있다. 그러나 인증 방식이 GitHub OAuth 단일로 변경된 현재 설계에서 이메일 발송 기능은 제거 대상이다. GitHub OAuth 인증에는 이메일 발송(인증 메일)이 필요 없다.
  - 영향 범위: 개발자가 `tech-stack.md`를 참조해 Nodemailer + Gmail SMTP를 구현 대상으로 오해할 수 있다. 불필요한 의존성이 추가될 수 있다.
  - 권장 조치: `tech-stack.md` 3절의 "이메일 발송" 비교표 섹션을 삭제하거나, "이메일 인증 제거(GitHub OAuth 단일 인증으로 변경)에 따라 미적용" 주석으로 대체한다.

---

### CP-3. PRD/MVP-scope ↔ system-architecture 컴포넌트 완전성

**결과**: [이상 없음]

PRD Must-have 기능(F-01~F-08) 전체가 system-architecture 컴포넌트에 반영되어 있다. GitHub OAuth 단일 로그인 흐름이 system-architecture 3.3절에 상세히 다이어그램으로 명시되어 있다. 사용자 계정 repo 생성이 GithubModule에 반영되어 있다. GitHub OAuth token AES-256 암호화가 AuthModule에 명시되어 있다. Claude API key 운영자 소유 방식이 AgentModule 설명 및 5.2절에 반영되어 있다. 피드백 루프(analysis_ready 이벤트, feedback API)가 시퀀스 다이어그램에 포함되어 있다. 추가 이슈 없음.

---

### CP-4. tech-stack ↔ system-architecture 구현 일치

**결과**: [이상 없음]

tech-stack에 정의된 모든 라이브러리가 system-architecture 컴포넌트에서 역할이 부여되어 있다. GitHub OAuth 관련 라이브러리(`passport-github2`, `@nestjs/passport`)가 두 문서에서 일치한다. AES-256 암호화(`Node.js crypto`)가 tech-stack 2.4절 인증 섹션과 system-architecture `AuthModule` 설명에서 일치한다. 추가 이슈 없음.

---

### CP-5. ERD ↔ API spec 데이터 모델 일치

**결과**: [이상 없음]

ERD `generations.status` CONSTRAINT 허용값(`pending | analyzing | awaiting_feedback | developing | testing | uploading | completed | failed | timeout`)이 `api-spec.md` `GET /generation` Query Parameter `status` 허용값과 일치한다. ERD `generations.current_stage` CONSTRAINT 허용값(`analyzing | awaiting_feedback | developing | testing | uploading`)이 API spec SSE stage 값 정의와 일치한다. ERD `users` 테이블에 `github_access_token` 컬럼(AES-256 암호화 저장)이 명시되어 있으며, API spec의 GitHub OAuth 콜백 동작("github_access_token 갱신")과 일치한다. 추가 이슈 없음.

---

### CP-6. ERD ↔ KPI 측정 가능성

**결과**: [불일치]

**발견된 이슈**:

- **이슈 4-2**: `kpi.md` KPI-S-04(회원가입 완료율)의 정의가 "회원가입 페이지(S-02) 진입 후 **이메일 인증 완료**까지 도달한 비율"로 명시되어 있으며, 측정 방법도 "`users` 테이블 `is_email_verified=true` 신규 전환 건수"를 기준으로 한다. 그러나 인증 방식이 GitHub OAuth 단일로 변경됨에 따라 이메일 인증 단계가 없어졌고, ERD `users` 테이블에도 `is_email_verified` 컬럼이 존재하지 않는다. KPI-S-04의 정의와 측정 방법이 현재 설계와 완전히 불일치한다.
  - 영향 범위: KPI-S-04를 측정할 컬럼(`is_email_verified`)이 ERD에 없으므로 측정 자체가 불가능하다. "회원가입 완료율"이라는 KPI 개념 자체를 "GitHub OAuth 로그인 완료율" 또는 "첫 생성 요청 전환율"로 재정의해야 한다.
  - 권장 조치: `kpi.md` KPI-S-04의 정의와 측정 방법을 GitHub OAuth 단일 로그인에 맞게 재정의한다. 예: "서비스 진입(랜딩 페이지) 후 GitHub OAuth 로그인 완료까지 도달한 비율"로 변경하고, 측정 방법을 "신규 `users` 레코드 생성 건수 / 랜딩 페이지 방문 세션 수(GA4)"로 수정한다. 관련 측정 방법 문서(`operations-guide.md` 1.2절 비즈니스 메트릭, `kpi.md` 실패 신호)도 함께 수정한다.

- **이슈 4-3**: `kpi.md` 회차 3까지의 수정에서 ERD `users.is_email_verified` 컬럼을 참조하는 항목이 여러 곳에 남아있다. KPI-S-01 측정 방법의 "generations.status=processing" 참조, KPI-S-04 정의 전체, KPI 실패 신호의 "회원가입 완료율 극저 — 이메일 인증 흐름" 항목이 이메일 인증 제거 결정과 불일치한다.
  - 영향 범위: KPI 문서가 이미 폐기된 인증 방식을 기준으로 작성되어 있어 실제 측정이 불가능한 KPI가 공식 문서에 남아있다.
  - 권장 조치: `kpi.md`에서 이메일 인증 관련 모든 언급을 GitHub OAuth 기반으로 수정한다. (이슈 4-2와 연동하여 일괄 처리 권장)

---

### CP-7. API spec ↔ wireframe/user-flow 화면-API 연결 일치

**결과**: [모순]

**발견된 이슈**:

- **이슈 4-4**: `wireframe.md`에 **S-02(회원가입 페이지)**, **S-03(이메일 인증 안내 페이지)**, **S-04(이메일 인증 완료 페이지)**, **S-05(로그인 페이지)**가 이메일+비밀번호 기반으로 설계되어 있다. S-02는 이메일, username, 비밀번호 입력 필드를 가지고 있고, S-05는 이메일+비밀번호 로그인 폼이다. 인증이 GitHub OAuth 단일로 변경된 현재 설계에서 이 4개 화면은 존재 근거가 없다.
  - 영향 범위: wireframe이 폐기된 인증 흐름을 그대로 포함하고 있어 Frontend 개발자가 이메일 인증 UI를 구현하게 될 수 있다. S-01 랜딩 페이지도 "GitHub로 로그인" 버튼이 아닌 "시작하기"/"로그인" 이중 버튼으로 설계되어 있다.
  - 권장 조치: `wireframe.md`의 S-02~S-05를 삭제하거나 GitHub OAuth 흐름으로 대체한다. S-01 랜딩 페이지를 "GitHub로 로그인" 단일 CTA로 수정한다. 화면 인벤토리(1절)를 업데이트하고, 화면 간 이동 관계 다이어그램(3절)에서 이메일 인증 관련 경로를 제거한다.

- **이슈 4-5**: `wireframe.md` 컴포넌트 목록(4.2절 인증 관련 컴포넌트)에 `EmailInput`, `PasswordInput`, `PasswordStrengthBar` 컴포넌트가 여전히 정의되어 있다. 이는 이메일+비밀번호 인증에 필요한 컴포넌트로, GitHub OAuth 단일 인증 체계에서는 불필요하다.
  - 영향 범위: 불필요한 컴포넌트가 구현 대상으로 오해될 수 있다.
  - 권장 조치: `wireframe.md` 4.2절 인증 관련 컴포넌트 목록에서 `EmailInput`, `PasswordInput`, `PasswordStrengthBar`, `InlineError`(인증 전용 용도)를 제거하거나, GitHub OAuth 버튼 컴포넌트(`GitHubOAuthButton`)로 대체한다.

---

### CP-8. wireframe ↔ user-flow 화면 전환 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 4-6**: `wireframe.md` 3절 화면 간 이동 관계 다이어그램에서 S-01 → S-02(회원가입) → S-03(이메일 인증 안내) → S-04(인증 완료) → S-05(로그인) 경로가 명시되어 있다. 반면 `user-flow.md` SC-01은 이미 GitHub OAuth 단일 로그인으로 수정되어 있다. 두 문서의 인증 흐름이 서로 다르다.
  - 영향 범위: wireframe을 참고하는 팀원은 이메일 인증 흐름이 맞다고 오해하고, user-flow를 참고하는 팀원은 GitHub OAuth 흐름이 맞다고 이해하여 구현 방향이 엇갈릴 수 있다.
  - 권장 조치: `wireframe.md` 3절 화면 전환 다이어그램을 GitHub OAuth 인증 흐름으로 수정한다. 이메일 인증 관련 노드(S-02, S-03, S-04, S-05, EMAIL 이벤트)를 제거하고 OAuth 콜백 흐름으로 대체한다.

---

### CP-9. user-persona ↔ user-flow 페르소나 일관성

**결과**: [이상 없음]

`user-flow.md` 시나리오 목록(1절)에서 SC-02의 대상 페르소나가 "페르소나 1 — 이태양 / 페르소나 2 — 김현우"로 명시되어 있으며, `user-persona.md`에서 페르소나 1은 이태양(주니어 개발자), 페르소나 2는 김현우(시니어 개발자)로 정의되어 있어 순서와 이름이 일치한다. SC-03의 대상 페르소나 "이태양 (시나리오 3)"이 `user-persona.md` 이태양의 시나리오 3("여러 프로젝트 관리")과 적절히 대응된다. user-flow 전체적으로 개발자 타겟이 일관됨. 비개발자 페르소나 언급 없음. 이슈 없음.

---

### CP-10. PRD/MVP-scope ↔ KPI 목표 수치 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 4-8**: `kpi.md` 2절 측정 계획의 KPI-S-01(생성 대기 이탈률) 측정 방법에 "`generations` 테이블의 `status=processing` 상태에서 SSE 연결이 없는 건 수와 비교"라고 명시되어 있다. 그러나 현재 `erd.md`의 `generations.status` CONSTRAINT에 `processing`이라는 값은 정의되어 있지 않다. 유효한 status 값은 `pending | analyzing | awaiting_feedback | developing | testing | uploading | completed | failed | timeout`이다.
  - 영향 범위: `status=processing`으로 쿼리 시 항상 빈 결과가 반환된다. KPI-S-01 측정이 실질적으로 불가능해진다.
  - 권장 조치: `kpi.md` KPI-S-01 측정 방법의 `status=processing`을 `status IN ('analyzing', 'awaiting_feedback', 'developing', 'testing', 'uploading')`으로 수정한다.

---

### CP-11. operations-guide ↔ system-architecture/tech-stack 운영 일치

**결과**: [모순]

**발견된 이슈**:

- **이슈 4-9**: `operations-guide.md` Runbook 3-C가 **"Gmail SMTP 장애 (이메일 인증 발송 불가)"** 시나리오를 다루고 있다. 인증 방식이 GitHub OAuth 단일로 변경됨에 따라 이메일 발송 기능(이메일 인증 메일) 자체가 제거 대상이다. Runbook 3-C는 존재 근거가 없는 장애 시나리오다.
  - 영향 범위: 운영팀이 존재하지 않는 Gmail SMTP 컴포넌트를 관리 대상으로 오인하여 불필요한 설정을 진행할 수 있다.
  - 권장 조치: `operations-guide.md` Runbook 3-C(Gmail SMTP 장애)를 삭제하거나 "이메일 인증 제거로 인해 미적용" 메모로 대체한다.

- **이슈 4-10**: `operations-guide.md` 3.1절 Backend 환경 변수 목록에 **`GMAIL_USER`**, **`GMAIL_APP_PASSWORD`**, **`EMAIL_VERIFICATION_EXPIRES_HOURS`** 3개 항목이 포함되어 있다. 또한 **`GITHUB_TOKEN`**(운영자 GitHub Personal Access Token)과 **`GITHUB_OWNER`**(생성 repo 소유자 계정명: `mvp-builder-org`)가 포함되어 있는데, 이는 사용자 계정에 repo를 생성하는 현재 설계(GitHub OAuth token 사용)와 모순된다.
  - 영향 범위: 운영자가 환경 변수를 설정할 때 (1) 이미 제거된 Gmail SMTP 관련 변수를 설정하거나, (2) 운영자 GitHub token으로 모든 repo를 생성하는 잘못된 방식을 구현할 수 있다.
  - 권장 조치: `operations-guide.md` 3.1절에서 `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_VERIFICATION_EXPIRES_HOURS`, `GITHUB_TOKEN`, `GITHUB_OWNER` 항목을 제거하고, `ENCRYPTION_KEY`(GitHub OAuth token AES-256 암호화 키) 항목을 추가한다. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`이 있는지 확인하여 없으면 추가한다.

- **이슈 4-11**: `operations-guide.md` 1.2절 비즈니스 메트릭 알림에 "신규 가입 0건: 24시간 이상 신규 가입 없음 → **이메일 인증 흐름** 또는 회원가입 API 동작 확인"이라는 설명이 있다. 이메일 인증 흐름은 제거 대상이므로 이 설명이 불일치한다.
  - 영향 범위: 장애 대응 담당자가 이메일 인증 흐름을 확인하려 할 수 있다.
  - 권장 조치: `operations-guide.md` 1.2절 해당 항목의 대응 방법을 "GitHub OAuth 인증 흐름 또는 회원가입 API 동작 확인"으로 수정한다.

---

### CP-12. operations-guide ↔ KPI 측정-모니터링 연결

**결과**: [불일치]

**발견된 이슈**:

- **이슈 4-12**: `operations-guide.md` 4.1절 백업 대상 테이블 목록에 `erd.md`의 데이터 모델(`users`, `email_verification_tokens`, `refresh_tokens`, `generations`)을 기반으로 작성되어 있다. 그러나 현재 `erd.md`에는 `email_verification_tokens` 테이블과 `refresh_tokens` 테이블이 존재하지 않는다. ERD는 `users`와 `generations` 2개 테이블만 가진다. GitHub OAuth 단일 인증으로 변경되어 이메일 인증 토큰 테이블과 Refresh Token 테이블이 필요 없어졌다.
  - 영향 범위: 백업 정책이 존재하지 않는 테이블을 대상으로 명시되어 있어 혼란을 유발한다. 실제 `generations` 테이블과 `users` 테이블이 백업 대상임을 명확히 해야 한다.
  - 권장 조치: `operations-guide.md` 4.1절 백업 대상을 실제 ERD 테이블(`users`, `generations`)로 수정한다.

---

### CP-13. constitution 보안 원칙 ↔ API spec/ERD/system-architecture 준수

**결과**: [모순]

**발견된 이슈**:

- **이슈 4-13**: `constitution.md` 2절 기술 스택 요약 테이블에 **"인증: 이메일 기반 회원가입/로그인"**이 `[결정]` 상태로 명시되어 있다. 그러나 실제 결정은 GitHub OAuth 단일 로그인으로 변경되었으며, PRD, tech-stack, system-architecture, api-spec 모두 GitHub OAuth를 기반으로 작성되어 있다. constitution이 폐기된 인증 방식을 최상위 원칙으로 명시하고 있어 모순이 발생한다.
  - 영향 범위: constitution은 프로젝트 전체의 최상위 기준 문서다. 신규 에이전트 또는 팀원이 constitution을 기반으로 작업 시 이메일 기반 인증을 구현 기준으로 오해할 수 있다.
  - 권장 조치: `constitution.md` 2절 기술 스택 요약의 "인증" 항목을 "GitHub OAuth 2.0 + JWT"로 수정한다.

- **이슈 4-14**: `constitution.md` 보안 원칙에서 **C-SEC-01** "이메일 기반 회원가입/로그인을 사용한다", **C-SEC-03** "Refresh Token은 DB에 저장하며 만료 시간은 7일로 설정한다", **C-SEC-05** "비밀번호는 bcrypt(salt rounds: 12)로 해싱하여 저장한다"가 GitHub OAuth 단일 인증으로의 변경과 모순된다. 이메일/비밀번호 기반 인증이 없으므로 비밀번호 해싱(C-SEC-05)이 불필요하고, Refresh Token DB 저장(C-SEC-03) 여부도 재검토가 필요하다.
  - 영향 범위: constitution의 보안 원칙이 현재 설계와 불일치하여 구현 기준이 모호해진다. C-SEC-05에 따라 `password_hash` 컬럼을 ERD에 추가하거나 bcrypt 의존성을 추가하는 잘못된 구현이 발생할 수 있다.
  - 권장 조치: `constitution.md` C-SEC-01을 "GitHub OAuth 2.0 단일 로그인을 사용한다. 이메일/비밀번호 인증은 사용하지 않는다."로 수정한다. C-SEC-05를 삭제하거나 "비밀번호 인증 미사용으로 해당 없음"으로 표시한다. C-SEC-03을 GitHub OAuth token 관리 정책(AES-256 암호화 저장)으로 대체한다. 9절 의사결정 기록의 "인증 방식: 이메일 기반"을 "GitHub OAuth 2.0"으로 수정한다.

- **이슈 4-15**: `constitution.md` C-TEST-02가 "인증 흐름 전체 (회원가입 → 이메일 인증 → 로그인 → 토큰 갱신 → 로그아웃)"를 필수 테스트 대상으로 명시하고 있다. 이메일 인증이 제거되어 이 흐름은 "(GitHub OAuth 시작) → (콜백 처리 및 계정 생성) → (JWT 발급) → (로그아웃)"으로 변경되어야 한다.
  - 영향 범위: 테스트 코드 작성 시 존재하지 않는 이메일 인증 단계를 구현하려 할 수 있다.
  - 권장 조치: `constitution.md` C-TEST-02를 "GitHub OAuth 인증 흐름 전체 (OAuth 시작 → 콜백 처리 → 계정 생성/갱신 → JWT 발급 → 로그아웃)"로 수정한다.

---

### 요약

| 체크포인트 | 결과 | 이슈 수 |
|-----------|------|---------|
| CP-1. PRD ↔ MVP-scope | [이상 없음] | 0 |
| CP-2. PRD/MVP-scope ↔ tech-stack | [불일치] | 1 |
| CP-3. PRD/MVP-scope ↔ system-architecture | [이상 없음] | 0 |
| CP-4. tech-stack ↔ system-architecture | [이상 없음] | 0 |
| CP-5. ERD ↔ API spec | [이상 없음] | 0 |
| CP-6. ERD ↔ KPI | [불일치] | 2 |
| CP-7. API spec ↔ wireframe/user-flow | [모순] | 2 |
| CP-8. wireframe ↔ user-flow | [불일치] | 1 |
| CP-9. user-persona ↔ user-flow | [이상 없음] | 0 |
| CP-10. PRD/MVP-scope ↔ KPI | [불일치] | 1 |
| CP-11. operations-guide ↔ system-architecture/tech-stack | [모순] | 3 |
| CP-12. operations-guide ↔ KPI | [불일치] | 1 |
| CP-13. constitution 보안 원칙 ↔ API spec/ERD/architecture | [모순] | 3 |

**총 이슈**: 14건 (불일치 6 / 누락 0 / 모순 8)

**상태**: 수정 필요

---

## 정합성 검토 루프 중단 (회차 4)

3회 반복 수정 후에도 아래 이슈가 해결되지 않았습니다.
이번 회차의 이슈들은 이전 자동 수정 과정에서 놓친 구조적 변경(이메일 인증 제거, 타겟 개발자 전용 등)이 여러 문서에 걸쳐 누적된 것으로, 범위가 넓고 상호 연관성이 높습니다.

### 미해결 이슈

- **이슈 4-1** [불일치]: `tech-stack.md` 이메일 발송(Nodemailer + Gmail SMTP) 섹션이 인증 방식 변경 후에도 유지됨 (최초 발견: 회차 4)
- **이슈 4-2** [불일치]: `kpi.md` KPI-S-04가 이메일 인증 완료율로 정의되어 있으며 ERD에 `is_email_verified` 컬럼이 없어 측정 불가 (최초 발견: 회차 4)
- **이슈 4-3** [불일치]: `kpi.md` 전반에 이메일 인증 기반 측정 방법 잔존 (최초 발견: 회차 4)
- **이슈 4-4** [모순]: `wireframe.md` S-02~S-05가 이메일+비밀번호 인증 기반으로 설계되어 있어 GitHub OAuth 단일 인증과 모순 (최초 발견: 회차 4)
- **이슈 4-5** [모순]: `wireframe.md` 4.2절 인증 컴포넌트 목록에 이메일 인증용 컴포넌트 잔존 (최초 발견: 회차 4)
- **이슈 4-6** [불일치]: `wireframe.md` 화면 전환 다이어그램에 이메일 인증 경로 잔존, `user-flow.md` SC-01과 불일치 (최초 발견: 회차 4)
- **이슈 4-8** [불일치]: `kpi.md` KPI-S-01 측정 방법에 `status=processing` 참조 (ERD에 존재하지 않는 값) (최초 발견: 회차 4)
- **이슈 4-9** [모순]: `operations-guide.md` Runbook 3-C가 폐기된 Gmail SMTP 장애를 다루고 있음 (최초 발견: 회차 4)
- **이슈 4-10** [모순]: `operations-guide.md` 환경변수에 Gmail 관련 변수 3개 및 운영자 GitHub token 관련 변수(`GITHUB_TOKEN`, `GITHUB_OWNER`) 잔존 (최초 발견: 회차 4)
- **이슈 4-11** [불일치]: `operations-guide.md` 1.2절 알림 설명에 이메일 인증 흐름 언급 (최초 발견: 회차 4)
- **이슈 4-12** [불일치]: `operations-guide.md` 4.1절 백업 대상에 존재하지 않는 테이블(`email_verification_tokens`, `refresh_tokens`) 명시 (최초 발견: 회차 4)
- **이슈 4-13** [모순]: `constitution.md` 2절 기술 스택에 "인증: 이메일 기반 회원가입/로그인"이 [결정]으로 명시 (최초 발견: 회차 4)
- **이슈 4-14** [모순]: `constitution.md` C-SEC-01, C-SEC-03, C-SEC-05가 폐기된 이메일/비밀번호 인증 방식을 전제로 작성됨 (최초 발견: 회차 4)
- **이슈 4-15** [모순]: `constitution.md` C-TEST-02가 이메일 인증 흐름 테스트를 필수로 명시 (최초 발견: 회차 4)

### 선택지

1. **7-doc-consistency-fixer를 호출하여 자동 수정 진행** — 위 이슈들은 명확한 수정 방향이 있으므로 자동 수정이 가능하다. 특히 이슈 4-4(`wireframe.md` 대규모 재설계)는 S-02~S-05를 삭제하고 GitHub OAuth 로그인 화면 1개로 대체해야 하므로 수정 범위가 넓다.
2. **잔여 이슈를 인지한 상태로 `8-task-breakdown`으로 진행** — 이슈들이 구현 전 수정되지 않으면 개발자가 이메일 인증 코드를 구현할 위험이 있다. 권장하지 않는다.
3. **특정 이슈 수정 방향 직접 지시** — 이슈 4-4(wireframe 재설계) 등 범위가 큰 항목에 대한 추가 지시를 제공한다.

---

## 회차 5 — 2026-03-26

> 이전 회차 이슈 중 수정된 항목: 이슈 4-1, 4-2, 4-3, 4-4, 4-5, 4-6, 4-8, 4-9, 4-10, 4-11, 4-12, 4-13, 4-14, 4-15 (14건 전체)
> 이번 회차 신규 이슈: 2건

---

### CP-1. PRD ↔ MVP-scope 기능 범위 일치

**결과**: [이상 없음]

PRD Must-have F-01~F-08(F-02a~F-02c 포함)이 MVP-scope In-scope와 1:1 대응 유지. PRD 성능 목표 "평균 5분 이내(목표)"와 MVP-scope 가설 2 표현이 일치한다. PRD 비기능 요구사항(GitHub OAuth, AES-256 암호화, Docker, BullMQ)이 MVP-scope 출시 전제 조건에 반영되어 있다. Generation 상태값 9개가 두 문서에서 일치한다. 추가 이슈 없음.

---

### CP-2. PRD/MVP-scope ↔ tech-stack 기술 스택 일치

**결과**: [이상 없음]

회차 4 이슈 4-1 수정 확인. `tech-stack.md` 3절에 이메일 발송(Nodemailer + Gmail SMTP) 섹션이 존재하지 않는다. `tech-stack.md` 6절 환경 변수 목록에 `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`, `ENCRYPTION_KEY`가 포함되어 있어 GitHub OAuth 단일 인증 방식과 일치한다. `PORT`, `JWT_EXPIRES_IN`, `FRONTEND_URL` 항목이 환경 변수 목록에 포함되어 있다. repo 네이밍 규칙 `mvp-{keyword}-{username}`이 PRD, MVP-scope, tech-stack에서 일치한다. 추가 이슈 없음.

---

### CP-3. PRD/MVP-scope ↔ system-architecture 컴포넌트 완전성

**결과**: [이상 없음]

PRD Must-have 기능(F-01~F-08) 전체가 system-architecture 컴포넌트에 반영되어 있다. GitHub OAuth 단일 로그인 흐름이 3.3절 시퀀스 다이어그램에 명시되어 있다. 생성 파이프라인(analyzing → awaiting_feedback → developing → testing → uploading) 흐름이 3.2절 시퀀스 다이어그램에 반영되어 있다. 사용자 계정에 GitHub repo 생성(GithubModule)이 명시되어 있다. C-SEC-* ID 참조가 5절 전체에 추가되어 있다. 추가 이슈 없음.

---

### CP-4. tech-stack ↔ system-architecture 구현 일치

**결과**: [이상 없음]

tech-stack에 정의된 모든 라이브러리가 system-architecture 컴포넌트에서 역할이 부여되어 있다. GitHub OAuth 관련 라이브러리(`passport-github2`, `@nestjs/passport`)가 양쪽 문서에서 일치한다. AES-256 암호화(`Node.js crypto AES-256-GCM`)가 tech-stack 2.4절과 system-architecture `AuthModule` 및 5.1절에서 일치한다. 추가 이슈 없음.

---

### CP-5. ERD ↔ API spec 데이터 모델 일치

**결과**: [이상 없음]

ERD `generations.status` CONSTRAINT 허용값 9개(`pending | analyzing | awaiting_feedback | developing | testing | uploading | completed | failed | timeout`)가 `api-spec.md` `GET /generation` Query Parameter `status` 허용값과 일치한다. ERD `generations.current_stage` CONSTRAINT 허용값 5개가 API spec SSE `stage` 값 정의와 일치한다. ERD `users.github_access_token` 컬럼(AES-256 암호화 저장)이 API spec 콜백 동작과 일치한다. ERD에 `refresh_tokens` 또는 `email_verification_tokens` 테이블이 없어 API spec(GitHub OAuth 단일 인증)과 일치한다. 추가 이슈 없음.

---

### CP-6. ERD ↔ KPI 측정 가능성

**결과**: [이상 없음]

회차 4 이슈 4-2, 4-3 수정 확인. `kpi.md` KPI-S-04가 "GitHub OAuth 로그인 전환율"로 재정의되어 있으며, 측정 방법이 "신규 `users` 레코드 생성 건수 / 랜딩 페이지 방문 세션 수(GA4)"로 수정되어 있다. `is_email_verified` 컬럼 참조가 KPI 문서 전체에서 제거되어 ERD 테이블 구조(컬럼 없음)와 일치한다. KPI-S-01 측정 방법이 `status IN ('analyzing', 'developing', 'testing', 'uploading')` 기반으로 수정되어 있어 ERD CONSTRAINT와 일치한다. KPI-P-01, KPI-S-03 산출식이 ERD 컬럼(`generations.status`, `completed_at`, `created_at`)에 존재한다. 추가 이슈 없음.

---

### CP-7. API spec ↔ wireframe/user-flow 화면-API 연결 일치

**결과**: [불일치]

**발견된 이슈**:

- **이슈 5-1**: `wireframe.md` S-08(생성 완료 화면), S-09(생성 이력 페이지), S-10(생성 상세 페이지)의 Clone URL 예시에서 소유자가 `mvp-builder`(조직 계정)로 표기되어 있다. 예: `https://github.com/mvp-builder/mvp-reservation-john-doe`. 그러나 PRD F-04, tech-stack 2.5절, system-architecture GithubModule 설명 모두 "사용자 본인의 GitHub 계정에 repo를 생성"으로 명시하고 있어, 올바른 URL 형식은 `https://github.com/john-doe/mvp-reservation-john-doe`여야 한다.
  - 영향 범위: 와이어프레임을 참조하는 Frontend 개발자가 Clone URL의 소유자가 운영자 계정(`mvp-builder`)인 것으로 오해하여 GitHub API 연동 구현 방향을 잘못 설정할 수 있다.
  - 권장 조치: `wireframe.md` S-08, S-09, S-10의 Clone URL 예시를 `https://github.com/john-doe/mvp-reservation-john-doe` 형식(사용자 계정 기반)으로 수정한다.

---

### CP-8. wireframe ↔ user-flow 화면 전환 일치

**결과**: [이상 없음]

회차 4 이슈 4-4, 4-6 수정 확인. `wireframe.md`에서 S-04(이메일 인증 완료 화면)와 S-05(이메일+비밀번호 로그인 화면)가 "(제거됨)"으로 표기되어 있다. S-02는 GitHub OAuth 동의 흐름으로 재정의되어 있다. `wireframe.md` 3절 화면 전환 다이어그램이 `user-flow.md` SC-01(GitHub OAuth 로그인)과 일치하는 흐름을 사용한다. URL 경로(`/`, `/history`, `/history/:jobId`)가 일치한다. `wireframe.md` S-01에 "GitHub으로 시작하기" 단일 CTA가 명시되어 있다. 추가 이슈 없음.

---

### CP-9. user-persona ↔ user-flow 페르소나 일관성

**결과**: [이상 없음]

`user-persona.md`에 페르소나 1(이태양, 주니어 개발자)과 페르소나 2(김현우, 시니어 개발자) 2개만 정의되어 있으며 비개발자 페르소나가 없다. `user-flow.md`의 시나리오 대상 페르소나(이태양, 김현우)가 user-persona 정의와 일치한다. SC-02가 이태양/김현우 시나리오 1에, SC-03이 이태양 시나리오 3에 대응된다. 분석 문서 검토 및 피드백 루프 행동 패턴이 두 페르소나의 기술 수준 및 니즈와 일치한다. 추가 이슈 없음.

---

### CP-10. PRD/MVP-scope ↔ KPI 목표 수치 일치

**결과**: [이상 없음]

회차 4 이슈 4-8 수정 확인. `kpi.md` KPI-S-01 측정 방법의 `status=processing`이 `status IN ('analyzing', 'awaiting_feedback', 'developing', 'testing', 'uploading')`으로 수정되어 ERD 상태값과 일치한다. PRD 성능 목표(평균 5분 이내, P95 3초 이내)가 KPI-S-03(P50 3분 이하), KPI-S-06(P95 3초 이내)에 반영되어 있다. MVP-scope 가설 1~3 검증 기준이 KPI-P-01, KPI-S-01, 가설 3 검증 지표에 대응된다. 추가 이슈 없음.

---

### CP-11. operations-guide ↔ system-architecture/tech-stack 운영 일치

**결과**: [이상 없음]

회차 4 이슈 4-9, 4-10, 4-11 수정 확인. `operations-guide.md` Runbook 3-C가 "GitHub OAuth 장애 (로그인 불가)" 시나리오로 교체되어 있다. 3.1절 Backend 환경 변수 목록에 `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_VERIFICATION_EXPIRES_HOURS`, `GITHUB_TOKEN`, `GITHUB_OWNER`가 없고, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`, `ENCRYPTION_KEY`가 포함되어 있다. 1.2절 비즈니스 메트릭 알림의 "신규 가입 0건" 대응 방법이 "GitHub OAuth 로그인 흐름 또는 회원가입 API 동작 확인"으로 수정되어 있다. `tech-stack.md` 6절 환경 변수 목록과 일치한다. 추가 이슈 없음.

---

### CP-12. operations-guide ↔ KPI 측정-모니터링 연결

**결과**: [이상 없음]

회차 4 이슈 4-12 수정 확인. `operations-guide.md` 4.1절 백업 대상이 ERD의 실제 테이블(`users`, `generations`)만 명시하고 있어 ERD 설계와 일치한다. `kpi.md` GA4 측정 도구가 `operations-guide.md` 1.4절에 반영되어 있다. KPI Kill 기준인 "생성 대기 이탈률 60% 초과"가 1.2절 비즈니스 메트릭 알림에 포함되어 있다. 추가 이슈 없음.

---

### CP-13. constitution 보안 원칙 ↔ API spec/ERD/system-architecture 준수

**결과**: [이상 없음]

회차 4 이슈 4-13, 4-14, 4-15 수정 확인. `constitution.md` C-SEC-01이 "GitHub OAuth 2.0을 단일 인증 수단으로 사용한다. 이메일/비밀번호 기반 인증은 사용하지 않는다."로 수정되어 있다. C-SEC-03이 GitHub OAuth token AES-256-GCM 암호화 저장으로 재정의되어 있다. C-SEC-05(bcrypt 비밀번호 해싱)가 삭제되어 있다. C-SEC-08이 "GitHub OAuth를 통해 획득한 사용자의 GitHub access token을 AES-256-GCM으로 암호화하여 DB에 저장"으로 명시되어 ERD 및 system-architecture와 일치한다. C-TEST-02가 "GitHub OAuth 로그인 → JWT 발급 → 인증 필요 API 접근 → 로그아웃"으로 수정되어 있다. `constitution.md` 2절 기술 스택 요약의 인증 항목이 "GitHub OAuth 2.0"으로 명시되어 있다. 추가 이슈 없음.

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
| CP-7. API spec ↔ wireframe/user-flow | [불일치] | 1 |
| CP-8. wireframe ↔ user-flow | [이상 없음] | 0 |
| CP-9. user-persona ↔ user-flow | [이상 없음] | 0 |
| CP-10. PRD/MVP-scope ↔ KPI | [이상 없음] | 0 |
| CP-11. operations-guide ↔ system-architecture/tech-stack | [이상 없음] | 0 |
| CP-12. operations-guide ↔ KPI | [이상 없음] | 0 |
| CP-13. constitution 보안 원칙 ↔ API spec/ERD/architecture | [이상 없음] | 0 |

**총 이슈**: 1건 (불일치 1 / 누락 0 / 모순 0)

**상태**: 수정 필요
