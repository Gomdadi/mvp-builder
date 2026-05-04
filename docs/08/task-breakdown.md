# 개발 태스크 분해서 — AI 기반 자동화 MVP 빌더

---

## 스프린트 구성

| 스프린트 | 기간 | 목표 | 문서 |
|----------|------|------|------|
| Sprint 1 | 4일 | 파이프라인 핵심 + 1차 배포 (EC2) | [sprint-1.md](./sprint-1.md) |
| Sprint 2 | 미정 | 인증·사용자 관리·프론트·2차 배포 | [sprint-2.md](./sprint-2.md) |

---

## 에픽 전체 목록

| 에픽 ID | 에픽명 | 스프린트 |
|---------|--------|----------|
| E1 | 프로젝트 초기 설정 | Sprint 1 |
| E2 | 데이터베이스 | Sprint 1 (파이프라인 테이블) / Sprint 2 (사용자·인증 테이블 추가) |
| E3 | 인증 (GitHub OAuth + JWT) | Sprint 2 |
| E4 | 사용자 관리 API | Sprint 2 |
| E5 | 프로젝트 CRUD API | Sprint 2 |
| E6 | Claude Agent 서비스 | Sprint 1 |
| E7 | 파이프라인 오케스트레이션 | Sprint 1 |
| E8 | SSE 실시간 스트리밍 | Sprint 1 |
| E9 | GitHub 연동 서비스 | Sprint 1 |
| E10 | 프론트엔드 UI | Sprint 2 |
| E11 | 테스트 | Sprint 2 |
| E12 | 배포 / CI/CD | Sprint 1 (1차: 배포 전용) / Sprint 2 (2차: PR 검증 + 롤백) |
