# 사용자 플로우 다이어그램
# mvp-builder

> 작성일: 2026-03-17 (수정: 2026-03-26)
> 작성자: UX/Product Design Agent (4단계)
> 기반 문서: `docs/PRD.md`, `docs/MVP-scope.md`, `docs/user-persona.md`, `docs/api-spec.md`, `docs/wireframe.md`
> MVP In-scope 기능(F-01~F-08, F-02a~F-02c)만 다룬다.

---

## 1. 시나리오 목록

| 번호 | 제목 | 대상 페르소나 | 핵심 기능 |
|------|------|------------|----------|
| SC-01 | GitHub OAuth 로그인 | 전체 (신규/기존 사용자) | F-06 |
| SC-02 | 개발자의 기술 스택 지정 후 MVP 생성 (피드백 루프 포함) | 페르소나 1 — 이태양 / 페르소나 2 — 김현우 | F-01, F-02, F-02a, F-02b, F-02c, F-03, F-04, F-05, F-08 |
| SC-03 | 생성 이력에서 clone URL 재확인 | 페르소나 1 — 이태양 (시나리오 3) | F-07 |
| SC-04 | 생성 실패 및 재시도 | 전체 | F-02, F-03 |

---

## 2. 공통 플로우

### CF-01 로그인 상태 확인 및 인증 필요 처리

인증이 필요한 모든 화면에 진입 전 공통으로 수행되는 흐름이다.

```mermaid
flowchart TD
    A([페이지 접근]) --> B{메모리(Zustand store)에\nAccess Token 존재?}
    B -->|없음| C[로그인 페이지로 리다이렉트]
    B -->|있음| D{Access Token\n유효성 확인}
    D -->|유효| E([정상 진입])
    D -->|만료 401| F[GET /auth/github 재인증 유도]
    F --> C
```

---

### CF-02 공통 에러 처리

네트워크 오류, 서버 에러(5xx) 등 전역에서 처리되는 흐름이다.

```mermaid
flowchart TD
    A([API 호출]) --> B{응답}
    B -->|2xx 성공| C([정상 처리])
    B -->|4xx 클라이언트 에러| D[에러 코드별 인라인 메시지 표시]
    D --> E([사용자에게 피드백])
    B -->|5xx 서버 에러| F[토스트 알림: 서버 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.]
    F --> G([사용자에게 피드백])
    B -->|네트워크 에러| H[토스트 알림: 네트워크 연결을\n확인해주세요.]
    H --> G
```

---

## 3. 시나리오별 상세 플로우

### SC-01 GitHub OAuth 로그인

**대상 페르소나**: 전체 신규/기존 사용자
**트리거**: 랜딩 페이지에서 "GitHub로 로그인" 클릭
**종료점**: 로그인 완료 후 메인 생성 페이지 진입

```mermaid
flowchart TD
    START([랜딩 페이지 방문]) --> A["GitHub로 로그인" 클릭]
    A --> B[GET /auth/github\nGitHub OAuth 페이지로 리다이렉트]
    B --> C{GitHub 로그인 + 권한 승인}
    C -->|승인| D[GET /auth/github/callback\n처리]
    C -->|취소| E[랜딩 페이지로 복귀]

    D --> F{신규 사용자?}
    F -->|신규| G[GitHub 정보로 계정 자동 생성\ngithub_id, github_username, github_access_token 저장]
    F -->|기존| H[github_access_token 갱신]
    G --> I[JWT accessToken 발급]
    H --> I
    I --> J[프론트엔드로 리다이렉트\n?accessToken=...]
    J --> K[Zustand store에 accessToken 저장]
    K --> END([SC-01 종료 → SC-02 진입])
```

---

### SC-02 개발자의 기술 스택 지정 후 MVP 생성

**대상 페르소나**: 페르소나 1 — 이태양 / 페르소나 2 — 김현우
**트리거**: 로그인 후 메인 페이지 진입
**종료점**: 테스트 리포트 + clone URL 수령 및 저장소 활용

```mermaid
flowchart TD
    START([S-06 메인 생성 페이지]) --> A[요구사항 텍스트에어리어에 상세 요구사항 입력]
    A --> B[개발자 옵션 패널 클릭하여 펼침]
    B --> C{옵션 입력 방식}
    C -->|선택지에서 고름| D[ComboBox에서 선택\n예: Node.js + NestJS + React]
    C -->|직접 입력| E[ComboBox 자유 입력\n예: Django + Vue.js]
    D --> F[기술 스택 확정]
    E --> F
    F --> G[MVP 생성 시작 버튼 클릭]
    G --> H[POST /generation 호출\ndeveloperOptions 포함]
    H --> I{API 응답}
    I -->|201 jobId 반환| J[S-07 생성 진행 화면으로 전환\nGET /generation/:jobId/stream SSE 연결]
    I -->|409 GEN_001\n이미 진행 중인 작업| K[모달: 이미 진행 중인 생성 작업이 있습니다.\n진행 상황을 보시겠습니까?]
    K -->|확인| L[기존 jobId로 S-07 진행 화면 이동]
    K -->|취소| A

    J --> M[SSE 이벤트 수신 시작]
    M --> N{이벤트 타입}
    N -->|connected| O[연결 확인]
    O --> M
    N -->|progress\nstage=analyzing| P[분석 진행률 표시\n0~20%]
    P --> M
    N -->|analysis_ready| Q[S-08a 분석 문서 검토 화면으로 전환]

    Q --> R[GET /generation/:jobId/analysis 호출]
    R --> S[분석 문서 표시\nERD / API 설계 / 아키텍처 요약]
    S --> T{사용자 검토}
    T -->|피드백 없음 — 승인| U[POST /generation/:jobId/feedback\naction=approve]
    T -->|수정 요청| V[피드백 텍스트 입력\nPOST /generation/:jobId/feedback\naction=request_changes]
    U --> W[SSE 재연결\n개발 단계 시작]
    V --> W

    W --> X[SSE progress 이벤트 수신]
    X --> Y[단계별 진행률 실시간 업데이트\ndeveloping → testing → uploading]
    Y --> Z{SSE completed 이벤트}
    Z -->|completed| AA[S-08b 완료 화면 전환]
    Z -->|계속 대기| Y

    AA --> AB[테스트 리포트 표시\n통과/실패/커버리지]
    AB --> AC[clone URL 표시 + 복사 버튼]
    AC --> AD{사용자 행동}
    AD -->|URL 복사 클릭| AE[클립보드 복사 완료 토스트]
    AE --> AD
    AD -->|GitHub에서 열기 클릭| AF[새 탭으로 GitHub 저장소 열기]
    AF --> AD
    AD -->|새 MVP 만들기 클릭| AG[S-06 초기화]
    AD -->|이력 링크 클릭| AH[S-09 생성 이력 페이지 이동]
    END([SC-02 종료])
```

---

### SC-03 생성 이력에서 clone URL 재확인

**대상 페르소나**: 페르소나 1 — 이태양 (시나리오 3: 이전 프로젝트 재확인)
**트리거**: 재로그인 후 이력 페이지 진입
**종료점**: clone URL 복사 완료

```mermaid
flowchart TD
    START([재접속 후 SC-01 GitHub 로그인]) --> A[S-06 메인 생성 페이지 진입]
    A --> B[네비게이션에서 이력 클릭]
    B --> C[GET /generation 호출\npage=1 limit=20]
    C --> D{API 응답}
    D -->|200 목록 반환| E[S-09 생성 이력 목록 표시]
    D -->|데이터 없음\ntotal=0| F[빈 상태 화면\n첫 번째 MVP 만들기 CTA]

    E --> G{원하는 이력 탐색}
    G -->|상태 필터 적용| H[status=completed 필터 선택]
    H --> I[GET /generation?status=completed 재호출]
    I --> E
    G -->|페이지 이동| J[다음 페이지 클릭]
    J --> K[GET /generation?page=2 호출]
    K --> E
    G -->|이력 카드 복사 클릭| L[clone URL 클립보드 복사]
    L --> M[복사 완료 토스트 표시]
    M --> END([SC-03 종료])

    G -->|상세 보기 클릭| N[GET /generation/:jobId 호출]
    N --> O{API 응답}
    O -->|200 상세 반환| P[S-10 생성 상세 페이지 표시\nclone URL + 테스트 리포트]
    O -->|404 GEN_002| Q[토스트: 생성 작업을 찾을 수 없습니다.]
    Q --> E
    P --> R[clone URL 복사 클릭]
    R --> M
    P --> S[뒤로가기 클릭]
    S --> E

    G -->|awaiting_feedback 상태 이력 클릭| T[분석 문서 검토 화면으로 이동]
    T --> U[GET /generation/:jobId/analysis 호출]
    U --> V[분석 문서 재표시 + 피드백 제출 UI]
```

---

### SC-04 생성 실패 및 재시도

**대상 페르소나**: 전체
**트리거**: SC-02 진행 중 에러/타임아웃 이벤트 수신
**종료점**: 재시도 후 성공 또는 사용자 포기

```mermaid
flowchart TD
    START([S-07 생성 진행 중 또는 S-08a 분석 문서 검토 중]) --> A{SSE 이벤트 수신}
    A -->|error 이벤트| B[에러 상태 화면 전환\n에러 메시지 표시]
    A -->|timeout 이벤트| C[타임아웃 상태 화면 전환\n요구사항 간소화 안내 메시지]
    A -->|네트워크 끊김\nSSE 연결 종료| D[연결 재시도 안내 표시\n자동 재연결 시도]
    D --> E{재연결 성공?}
    E -->|성공| F[GET /generation/:jobId 상태 조회]
    F --> G{현재 상태}
    G -->|analyzing| H[분석 진행 화면 복원]
    H --> A
    G -->|awaiting_feedback| I[분석 문서 검토 화면 복원\nGET /generation/:jobId/analysis 재호출]
    G -->|developing/testing/uploading| J[진행 화면 복원\n현재 진행률 표시]
    J --> A
    G -->|completed| K[완료 화면 표시\n테스트 리포트 + clone URL 제공]
    G -->|failed| B
    E -->|실패 3회 이상| L[네트워크 오류 안내\n다시 시도하기 버튼]
    L --> M{사용자 선택}
    M -->|다시 시도| D
    M -->|나중에 이력에서 확인| N[S-09 생성 이력 페이지 이동]

    B --> O{사용자 선택}
    O -->|다시 시도하기| P[S-06 입력 화면 복원\n기존 요구사항과 옵션 유지]
    O -->|처음으로| Q[S-06 초기화]
    P --> R[요구사항 수정 또는 그대로 재시도]
    R --> S[POST /generation 재호출]
    S --> T{API 응답}
    T -->|201 성공| U[새 jobId로 S-07 진행 화면]
    U --> A
    T -->|409 GEN_001| V[이전 작업이 아직 처리 중입니다.\n잠시 후 이력에서 확인하세요.]

    C --> W{사용자 선택}
    W -->|요구사항 수정 후 다시 시도| X[S-06 요구사항 입력 복원]
    X --> Y[요구사항 단순화 후 재입력]
    Y --> S
    W -->|이력에서 확인| N

    END([SC-04 종료])
```

---

## 4. 플로우 간 관계 요약

```mermaid
flowchart LR
    CF01[CF-01\n로그인 상태 확인] -.->|모든 인증 필요 화면 진입 시| SC02
    CF01 -.->|모든 인증 필요 화면 진입 시| SC03
    CF02[CF-02\n공통 에러 처리] -.->|API 호출 실패 시 전역 적용| SC01
    CF02 -.->|API 호출 실패 시 전역 적용| SC02
    CF02 -.->|API 호출 실패 시 전역 적용| SC03

    SC01[SC-01\nGitHub OAuth 로그인] -->|완료 후| SC02
    SC02[SC-02\n개발자 생성\n피드백 루프] -->|생성 실패 시| SC04
    SC02 -->|완료 후| SC03
    SC03[SC-03\n이력 재확인]
    SC04[SC-04\n실패 및 재시도] -->|재시도| SC02
```

---

## 5. 엣지 케이스 정리

| 케이스 | 발생 시점 | 처리 방식 |
|--------|----------|----------|
| 생성 진행 중 브라우저 탭 닫기/새로고침 | SC-02 / S-07 | `beforeunload` 이벤트로 경고 모달 표시 (C-UX-12) |
| awaiting_feedback 상태에서 탭 닫기 후 재접속 | SC-02 / S-08a | 이력 페이지 또는 직접 URL 접근 시 분석 문서 검토 화면 복원 |
| 피드백 제출 후 개발 중 연결 끊김 | SC-02, SC-04 / S-07 | 자동 재연결 → GET /generation/:jobId로 상태 확인 → 진행 화면 복원 |
| 생성 진행 중 네트워크 끊김 (SSE 연결 해제) | SC-02, SC-04 | 자동 재연결 시도 → 실패 시 수동 재시도 안내 |
| 이미 진행 중인 생성 작업 있을 때 새 생성 요청 | SC-02 / `POST /generation` | `409 GEN_001` → 기존 작업 확인 모달 표시 |
| Access Token 만료 중 SSE 연결 시도 | SC-02 / `GET /generation/:jobId/stream` | Query Parameter `?token=<accessToken>` 만료 시 CF-01 → GitHub 재인증 |
| awaiting_feedback에서 피드백 미제출 24시간 경과 | SC-02 / 자동 처리 | BullMQ cron이 status를 `timeout`으로 업데이트. 이력 페이지에서 타임아웃 상태 표시. |
| 생성 완료 후 바로 이력 페이지 진입 시 | SC-03 / `GET /generation` | 최신 완료 항목이 목록 상단에 표시됨 |
| 이력 페이지에서 awaiting_feedback 항목 클릭 | SC-03 / S-09 | 분석 문서 검토 화면으로 이동하여 피드백 제출 가능 |
| 10,000자 초과 요구사항 입력 | SC-02 | 클라이언트: 글자 수 초과 시 입력 차단 + 경고 표시 / 서버: `400 GEN_003` |
| 생성 타임아웃 (생성 중) | SC-02, SC-04 / SSE `timeout` | 타임아웃 화면 전환 + "요구사항을 간소화해주세요" 안내 |
| 빈 생성 이력 목록 | SC-03 / `GET /generation` | 빈 상태(empty state) 화면 + "첫 번째 MVP 만들기" CTA |
| 다른 사용자의 jobId로 직접 URL 접근 | SC-03 / `GET /generation/:jobId` | `403 Forbidden` → 이력 페이지로 리다이렉트 + 에러 토스트 |
