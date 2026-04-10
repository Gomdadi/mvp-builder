# 운영 가이드 — AI 기반 자동화 MVP 빌더

---

## 모니터링 및 알림 기준

### 시스템 메트릭 알림

| 메트릭 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|--------|-----------|------------|------------|
| CPU 사용률 (EC2) | < 60% | ≥ 70% | ≥ 90% |
| 메모리 사용률 | < 70% | ≥ 80% | ≥ 95% |
| 디스크 사용률 | < 70% | ≥ 80% | ≥ 90% |
| API 응답 시간 (P95, 일반 CRUD) | < 2초 | ≥ 3초 | ≥ 5초 |
| 5xx 에러율 | < 1% | ≥ 2% | ≥ 5% |
| PostgreSQL 연결 수 | < 80% 풀 | ≥ 85% | ≥ 95% |
| Redis 메모리 사용률 | < 70% | ≥ 80% | ≥ 90% |

### 비즈니스 메트릭 알림

| 메트릭 | 이상 패턴 감지 기준 |
|--------|-------------------|
| 파이프라인 실패율 (K-01 역산) | 1시간 내 실패 5건 이상 |
| Claude API 오류 (502 CLAUDE_API_ERROR) | 10분 내 3건 이상 |
| GitHub API 오류 (502 GITHUB_API_ERROR) | 10분 내 3건 이상 |

### 알림 채널

> 가정: Slack webhook으로 경고 수준 이상 알림 전송. 심각 수준은 추가로 이메일 알림.

---

## 장애 대응 절차 (Runbook)

### 시나리오 1: 애플리케이션 서버 다운

- **증상**: 헬스체크 엔드포인트(`GET /health`) 응답 없음, CPU 0%, 5xx 급증
- **영향 범위**: 전체 서비스 불가
- **즉시 조치**:
  1. EC2 콘솔에서 인스턴스 상태 확인
  2. `docker compose ps`로 컨테이너 상태 확인
  3. `docker compose restart api` 재시작 시도
  4. 재시작 실패 시: 이전 AMI 스냅샷으로 인스턴스 교체
- **근본 원인 조사**: CloudWatch 로그 → NestJS 애플리케이션 에러 로그 확인
- **복구 확인**: `GET /health` 응답 200, 신규 파이프라인 생성 테스트

---

### 시나리오 2: 데이터베이스 연결 실패

- **증상**: `ECONNREFUSED` 로그, API 응답 500, 파이프라인 실패
- **영향 범위**: 전체 데이터 읽기/쓰기 불가
- **즉시 조치**:
  1. `docker compose ps db` PostgreSQL 컨테이너 상태 확인
  2. `docker compose restart db` 재시작
  3. `docker compose logs db` 에러 확인
- **근본 원인 조사**: 디스크 용량 확인 (`df -h`), PostgreSQL 로그 확인
- **복구 확인**: Prisma health check 쿼리 성공, 파이프라인 정상 생성 테스트

---

### 시나리오 3: Claude API 장애

- **증상**: 다수의 `502 CLAUDE_API_ERROR`, 파이프라인 FAILED 급증
- **영향 범위**: 파이프라인 신규 실행 불가 (기존 완료된 프로젝트 무영향)
- **즉시 조치**:
  1. Anthropic 상태 페이지 확인 (status.anthropic.com)
  2. 신규 파이프라인 시작 임시 차단 (프론트엔드 공지)
  3. 사용자에게 대기 안내 메시지 표시
- **근본 원인 조사**: Claude API 응답 에러 코드 확인 (429 rate limit vs 5xx 서비스 장애)
- **복구 확인**: Claude API 테스트 호출 성공 후 파이프라인 재개

---

### 시나리오 4: Redis 장애

- **증상**: JWT Refresh Token 검증 실패, 로그인 불가
- **영향 범위**: 신규 로그인 및 토큰 갱신 불가 (Access Token이 살아있는 세션은 15분간 유지)
- **즉시 조치**:
  1. `docker compose restart redis`
  2. Redis 연결 확인: `redis-cli ping`
- **복구 확인**: 로그인 → Access Token 갱신 정상 동작 테스트

---

### 시나리오 5: 디스크/스토리지 부족

- **증상**: 디스크 사용률 90% 이상, 로그 쓰기 실패, DB 쓰기 실패
- **영향 범위**: 파이프라인 저장, 로그 기록 불가
- **즉시 조치**:
  1. 오래된 로그 파일 삭제 (`/var/log` 확인)
  2. Docker 미사용 이미지/볼륨 정리: `docker system prune`
  3. EC2 EBS 볼륨 확장 (AWS 콘솔)
- **복구 확인**: `df -h` 사용률 60% 미만 확인

---

### 시나리오 6: 인증 모듈(AuthModule) 장애

- **증상**: 로그인/토큰 갱신 API 일괄 실패, GitHub OAuth 콜백 에러
- **영향 범위**: 신규 사용자 접근 불가. 기존 유효 Access Token 사용자는 15분간 유지
- **즉시 조치**:
  1. NestJS 로그에서 `AuthModule` 관련 스택트레이스 확인
  2. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` 환경 변수 정상 여부 확인
  3. GitHub OAuth App 설정(콜백 URL 등) 변경 여부 확인
- **복구 확인**: `GET /v1/auth/github` → GitHub 인증 페이지 정상 리다이렉트 확인

---

### 시나리오 7: 파이프라인 모듈(PipelineModule) 장애

- **증상**: 파이프라인 시작 후 진행 없음, SSE 이벤트 수신 중단, 프로젝트 status `ANALYZING`에서 고착
- **영향 범위**: 신규 파이프라인 실행 불가. 기존 완료 프로젝트 무영향
- **즉시 조치**:
  1. `pipeline_runs` 테이블에서 `status = RUNNING`이고 `started_at`이 30분 이상 경과된 레코드 확인
  2. NestJS 로그에서 `PipelineService` 에러 확인
  3. Claude API Key 유효성 확인 (만료 또는 잔액 부족 여부)
- **근본 원인 조사**: Claude API 응답 로그, GitHub API 응답 로그 순서로 확인
- **복구 확인**: 테스트 프로젝트로 파이프라인 Phase 1 정상 완료 확인

---

## 환경 변수 및 시크릿 목록

| 변수명 | 설명 | 필수 여부 | 예시 값 | 관리 방식 |
|--------|------|----------|---------|-----------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 필수 | `postgresql://user:pass@localhost:5432/mvpbuilder` | 로컬: .env / 운영: AWS Secrets Manager |
| `REDIS_URL` | Redis 연결 문자열 | 필수 | `redis://localhost:6379` | 로컬: .env / 운영: AWS Secrets Manager |
| `JWT_ACCESS_SECRET` | Access Token 서명 키 | 필수 | `random-256bit-secret` | AWS Secrets Manager |
| `JWT_REFRESH_SECRET` | Refresh Token 서명 키 | 필수 | `random-256bit-secret` | AWS Secrets Manager |
| `API_KEY_ENCRYPTION_KEY` | Claude API Key AES-256 암호화 마스터 키 | 필수 | `32-byte-hex-string` | AWS Secrets Manager |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | 필수 | `Ov23li...` | 환경 변수 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | 필수 | `secret...` | AWS Secrets Manager |
| `GITHUB_CALLBACK_URL` | OAuth 콜백 URL | 필수 | `https://api.mvpbuilder.io/v1/auth/github/callback` | 환경 변수 |
| `FRONTEND_URL` | 프론트엔드 Origin (CORS) | 필수 | `https://mvpbuilder.io` | 환경 변수 |
| `NODE_ENV` | 실행 환경 | 필수 | `production` | 환경 변수 |
| `CLAUDE_API_TIMEOUT` | Claude API 호출 타임아웃 (ms) | 선택 | `120000` | 환경 변수 |
| `CLAUDE_API_MAX_RETRIES` | Claude API 최대 재시도 횟수 | 선택 | `3` | 환경 변수 |

> 실제 비밀 값은 절대 코드나 문서에 포함하지 않는다. 운영 환경의 모든 시크릿(SECRET, KEY 포함 변수)은 AWS Secrets Manager에서 주입한다.

---

## 백업 및 복구 정책

### 백업 대상

| 대상 | 방식 | 주기 | 보존 기간 |
|------|------|------|-----------|
| PostgreSQL (전체 DB) | pg_dump → S3 업로드 | 일간 (새벽 3시) | 30일 |
| PostgreSQL (WAL) | 연속 아카이빙 | 실시간 | 7일 |
| Redis | RDB 스냅샷 | 6시간마다 | 7일 |

> 가정: AWS S3 버킷에 백업 파일 저장, 버킷 버전 관리 활성화.

### RTO / RPO 목표

| 항목 | 목표 |
|------|------|
| RTO (복구 목표 시간) | 2시간 이내 |
| RPO (복구 목표 시점) | 최대 24시간 전 데이터 (일간 백업 기준) |

### 복구 절차

1. S3에서 최신 pg_dump 파일 다운로드
2. `psql -U user -d mvpbuilder < backup.sql`
3. 서비스 재시작 및 헬스체크 확인

---

## 배포 절차

### 배포 환경

| 환경 | 용도 | 배포 트리거 |
|------|------|------------|
| 로컬 | 개발 및 단위 테스트 | 수동 |
| 스테이징 | PR 통합 테스트 | PR 오픈 시 자동 |
| 프로덕션 | 실 서비스 | `main` 브랜치 머지 시 자동 |

### 배포 프로세스 (GitHub Actions)

```
PR 오픈
  → 자동: lint, type-check, unit test, integration test
  → 통과 시: 스테이징 환경 배포

main 브랜치 머지
  → 자동: Docker 이미지 빌드 → ECR push
  → EC2에서 docker compose pull + up -d
  → 헬스체크 엔드포인트 확인
  → 실패 시: 자동 롤백 트리거
```

### 롤백 절차

1. 이전 ECR 이미지 태그 확인
2. `docker compose`의 이미지 태그를 이전 버전으로 변경
3. `docker compose up -d` 재배포
4. 헬스체크 확인

### 배포 전 체크리스트

- [ ] 환경 변수 및 시크릿 최신 상태 확인
- [ ] DB 마이그레이션 파일 확인 (`prisma migrate deploy`)
- [ ] Integration Test 전체 통과 확인
- [ ] 스테이징 환경에서 주요 파이프라인 수동 테스트 완료
- [ ] 롤백 이미지 태그 메모
