# 요구사항 명확화 기록

## 날짜: 2026-04-10

| # | 질문 | 답변 | 반영 위치 | 처리 |
|---|------|------|-----------|------|
| Q1 | E2E 테스트(Playwright) 포함 여부 | MVP에서는 Unit + Integration만. E2E 제외 | PRD.md 비기능 요구사항, constitution.md 테스트 전략 | 가정 → 결정 변경 |
| Q2 | 클라우드 플랫폼 선호 | AWS | constitution.md 인프라 원칙 | 가정 → 결정 변경 |
| Q3 | 작업 큐(BullMQ) 필요 여부 | MVP는 async/await만으로 처리. BullMQ는 Out-of-scope | PRD.md 확장성, MVP-scope.md Out-of-scope | 결정 |

## 반영 내용

- `constitution.md` C-TEST 계층: E2E 제외 확정, Unit + Integration만
- `constitution.md` C-INFRA: AWS 배포 환경 확정
- `PRD.md` 확장성: 작업 큐 없이 async/await 처리 명시
- `MVP-scope.md` Out-of-scope: BullMQ/작업 큐 이후 버전으로 분류
