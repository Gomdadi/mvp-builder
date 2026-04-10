# 기술 스택 결정서 — AI 기반 자동화 MVP 빌더

---

## 프론트엔드

| 항목 | 선택 | 선택 이유 |
|------|------|-----------|
| **프레임워크** | Next.js 14+ (App Router) | **[결정]** SSE 스트리밍 수신, 서버 컴포넌트, 라우팅 통합에 최적. Vercel 배포 옵션도 유지 |
| **언어** | TypeScript 5.x (strict) | 백엔드와 타입 공유 가능, 타입 안전성 |
| **상태 관리** | Zustand | 경량, 보일러플레이트 최소, 파이프라인 단계 상태 관리에 적합 |
| **스타일링** | Tailwind CSS + shadcn/ui | 빠른 UI 개발, 컴포넌트 커스터마이징 용이 |
| **SSE 처리** | 브라우저 EventSource API | AI 생성 진행 상황 실시간 수신 |
| **HTTP 클라이언트** | TanStack Query + fetch | 서버 상태 관리, 캐싱 |

### 대안 비교 (프론트엔드)

| 후보 | 제외 이유 |
|------|-----------|
| Vite + React SPA | SSR 미지원, SEO 불필요하나 Next.js 생태계가 더 풍부 |
| Nuxt.js (Vue) | 팀 스택이 Next.js 선호, 생태계 차이 |

---

## 백엔드

| 항목 | 선택 | 선택 이유 |
|------|------|-----------|
| **프레임워크** | NestJS 10+ | **[결정]** 모듈 기반 구조로 파이프라인 단계별 분리 용이, TypeScript 완전 지원, DI 내장 |
| **언어** | TypeScript 5.x (strict) | 프론트엔드와 타입 공유, Claude Agent SDK TypeScript 지원 |
| **AI 레이어** | Claude Agent SDK (TypeScript) | **[결정]** 제안서 명시, Anthropic 공식 SDK |
| **ORM** | Prisma | 타입 안전 쿼리, 마이그레이션 관리, PostgreSQL 지원 |
| **인증** | Passport.js + JWT | GitHub OAuth 전략 내장, NestJS 공식 지원 |
| **유효성 검사** | class-validator + class-transformer | NestJS DTO 패턴과 통합 |
| **SSE** | NestJS SSE (built-in) | AI 생성 진행 상황 스트리밍 전송 |

### 대안 비교 (백엔드)

| 후보 | 제외 이유 |
|------|-----------|
| Express.js | 모듈 구조 없어 파이프라인 복잡도 증가 시 관리 어려움 |
| Python FastAPI | Claude SDK Python 지원이 있으나, 프론트-백 타입 공유 불가, 팀 스택 불일치 |
| Hono | 경량이지만 DI, ORM 생태계 상대적으로 빈약 |

---

## 데이터베이스

| 항목 | 선택 | 선택 이유 |
|------|------|-----------|
| **메인 DB** | PostgreSQL 15+ | **[결정]** 관계형 데이터(유저-프로젝트-단계 관계) 관리에 적합, JSONB로 분석 문서 저장 |
| **캐시** | Redis | GitHub Token 캐시, 세션 관리, 향후 BullMQ 도입 시 재사용 |

> 가정: Redis는 MVP에서 세션/토큰 캐시 용도로만 사용한다. BullMQ는 Out-of-scope.

### 대안 비교 (DB)

| 후보 | 제외 이유 |
|------|-----------|
| Supabase | 플랫폼 종속성, 직접 운영 요구에 맞지 않음 |
| MongoDB | 유저-프로젝트-태스크 관계가 명확해 관계형이 더 적합 |

---

## 인프라 / 배포

| 항목 | 선택 | 선택 이유 |
|------|------|-----------|
| **클라우드** | AWS | **[결정]** 가장 범용적, ECS/EC2 선택 가능 |
| **컨테이너화** | Docker + Docker Compose | **[결정]** 로컬 개발 환경, 생성 코드도 동일 패턴 적용 |
| **CI/CD** | GitHub Actions | 코드 저장소와 동일 플랫폼, 설정 최소화 |
| **환경 변수** | AWS Secrets Manager (운영) / .env (로컬) | C-SEC-04 준수 |

> 가정: MVP 초기에는 EC2 단일 인스턴스로 운영하다 트래픽 증가 시 ECS로 마이그레이션한다.

---

## 전체 기술 스택 요약

```
Frontend:  Next.js 14 (App Router) + TypeScript + Tailwind + Zustand
Backend:   NestJS + TypeScript + Prisma + Passport.js (GitHub OAuth)
AI Layer:  Claude Agent SDK (TypeScript) — NestJS 서비스 레이어에 통합
Database:  PostgreSQL 15 + Redis
Infra:     Docker Compose (로컬/운영) + AWS EC2 + GitHub Actions
```
