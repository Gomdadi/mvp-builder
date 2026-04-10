# 사용자 플로우 다이어그램 — AI 기반 자동화 MVP 빌더

---

## 시나리오 목록

| # | 제목 | 대상 페르소나 |
|---|------|--------------|
| SC-01 | 신규 사용자 온보딩 및 첫 프로젝트 생성 | 박민준 (개발자), 이수연 (비개발자) |
| SC-02 | 분석 문서 검토 → 피드백 → 재확정 | 이수연 (비개발자) |
| SC-03 | Phase 3 코드 생성 및 GitHub 전달 | 박민준 (개발자), 김태원 (1인 개발자) |
| SC-04 | 에러 발생 시 복구 흐름 | 전체 |

---

## SC-01: 신규 사용자 온보딩 및 첫 프로젝트 생성

```mermaid
flowchart TD
    A([시작: 랜딩 페이지 접속]) --> B[GitHub 로그인 버튼 클릭]
    B --> C{GitHub OAuth 인증}
    C -->|인증 성공| D[대시보드 이동]
    C -->|인증 실패/거부| E[에러 메시지 노출\n랜딩 페이지 복귀]

    D --> F{API Key 등록 여부 확인}
    F -->|미등록| G[API Key 등록 안내 배너 표시]
    G --> H[설정 페이지 이동]
    H --> I[Claude API Key 입력 및 저장]
    I --> J{저장 성공?}
    J -->|실패: 유효하지 않은 키| K[에러 메시지\n재입력 요청]
    K --> I
    J -->|성공| D2[대시보드 복귀]
    F -->|등록됨| L[새 프로젝트 만들기 클릭]
    D2 --> L

    L --> M[프로젝트명 입력]
    M --> N[요구사항 자연어 입력]
    N --> O[기술 스택 선택\nFrontend / Backend / DB]
    O --> P[분석 시작 버튼 클릭]
    P --> Q[POST /projects 프로젝트 생성]
    Q --> R[POST /pipeline/:id/start]
    R --> S([파이프라인 진행 화면 S6으로 이동])
```

---

## SC-02: 분석 문서 검토 → 피드백 → 재확정

```mermaid
flowchart TD
    A([Phase 1 완료: 분석 문서 검토 화면 S7]) --> B[ERD / API 스펙 / 아키텍처 탭 확인]
    B --> C{내용이 만족스러운가?}

    C -->|예| D[이대로 확정 클릭]
    D --> E[POST /pipeline/:id/confirm]
    E --> F([Phase 2 태스크 분해 시작 → S6])

    C -->|아니오, 수정 요청| G[피드백 텍스트 입력\n예: 결제 기능 제외해주세요]
    G --> H[수정 요청 후 재분석 클릭]
    H --> I[POST /pipeline/:id/feedback]
    I --> J[Phase 1 재실행 → S6 진행 화면]
    J --> K[새 분석 문서 생성 완료]
    K --> L[S7 검토 화면 재표시\n버전 증가]
    L --> B

    B --> M{최대 재시도 횟수 초과?}
    M -->|예 3회 이상| N[수동 진행 안내 메시지 노출]
```

---

## SC-03: Phase 3 코드 생성 및 GitHub 전달

```mermaid
flowchart TD
    A([Phase 2 완료: 태스크 목록 확정]) --> B[Phase 3 자동 시작]
    B --> C[SSE 스트림 연결 유지]

    C --> D{태스크 반복 처리}
    D --> E[태스크 N: 테스트 코드 생성]
    E --> F[태스크 N: 구현 코드 생성]
    F --> G[태스크 N: 리팩터링]
    G --> H[SSE task_completed 이벤트 전송]
    H --> I{남은 태스크 있음?}
    I -->|예| D
    I -->|아니오| J[전체 코드베이스 완성]

    J --> K[GitHub 저장소 생성\nGitHub API 호출]
    K --> L{저장소 생성 성공?}
    L -->|실패| M[502 GITHUB_API_ERROR\n재시도 안내]
    L -->|성공| N[코드 push 완료]
    N --> O[SSE pipeline_completed 이벤트\ngithubRepoUrl 포함]
    O --> P([완료 화면 S8 자동 이동])

    P --> Q[GitHub 저장소 URL 표시]
    Q --> R[git clone + docker compose up --build 가이드 표시]
```

---

## SC-04: 에러 발생 시 복구 흐름

```mermaid
flowchart TD
    A([파이프라인 실행 중 에러 발생]) --> B{에러 유형}

    B -->|Claude API 호출 실패| C[502 CLAUDE_API_ERROR\nSSE pipeline_failed 이벤트]
    C --> D[에러 메시지 + 재시작 버튼 표시]
    D --> E{사용자 선택}
    E -->|재시작| F[POST /pipeline/:id/start 재호출]
    F --> G([파이프라인 재실행])
    E -->|포기| H[대시보드 복귀\n프로젝트 상태 FAILED 표시]

    B -->|GitHub API 호출 실패| I[502 GITHUB_API_ERROR]
    I --> J[코드는 생성됨\nGitHub 업로드만 실패 안내]
    J --> K[GitHub 재연동 후 업로드 재시도 버튼]

    B -->|네트워크 오류 SSE 끊김| L[자동 재연결 시도 3회]
    L --> M{재연결 성공?}
    M -->|성공| N[스트림 복구, 진행 계속]
    M -->|실패| O[페이지 새로고침 유도\n진행 상황은 DB에 보존]

    B -->|API Key 없음| P[409 API_KEY_MISSING]
    P --> Q[설정 페이지로 이동 안내]
```

---

## 공통 플로우

### 인증 만료 처리

```mermaid
flowchart LR
    A[API 요청] --> B{401 Unauthorized?}
    B -->|아니오| C[정상 응답]
    B -->|예| D[POST /auth/refresh 자동 시도]
    D --> E{Refresh 성공?}
    E -->|성공| F[새 Access Token으로 원래 요청 재시도]
    E -->|실패: Refresh 만료| G[로그아웃 처리\n로그인 화면으로 이동]
```
