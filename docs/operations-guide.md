# 운영 가이드 (Operations Guide)
# mvp-builder

> 작성일: 2026-03-17
> 작성자: PO/SRE Agent (5단계)
> 기반 문서: `docs/system-architecture.md`, `docs/tech-stack.md`, `docs/api-spec.md`, `docs/erd.md`, `docs/kpi.md`

---

## 1. 모니터링 및 알림 기준

### 1.1 시스템 메트릭 알림

#### CPU 사용률 (EC2 인스턴스)

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| `CPUUtilization` | 0~60% | 70% 이상 (5분 지속) | 90% 이상 (2분 지속) |

**알림 채널**: Slack `#alert-system` (경고), Slack `#alert-critical` + 담당자 이메일 (심각)

> 가정: BullMQ Worker가 Claude Agent SDK를 다수 동시 호출할 때 CPU 부하가 증가할 수 있다. 초기에는 사용자당 동시 생성 1건 제한(C-AGENT-03)으로 완화한다.

---

#### 메모리 사용률 (EC2 인스턴스)

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| `MemoryUtilization` (커스텀 메트릭) | 0~65% | 75% 이상 (5분 지속) | 90% 이상 (2분 지속) |

> 가정: EC2 기본 CloudWatch 에이전트는 메모리 메트릭을 수집하지 않는다. CloudWatch Agent를 EC2에 설치하거나 Node.js 애플리케이션에서 커스텀 메트릭으로 발행해야 한다.

---

#### 디스크 사용률

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| `disk_used_percent` (CloudWatch Agent) | 0~70% | 80% 이상 | 90% 이상 |

**주요 확인 경로**: `/var/lib/docker` (Docker 이미지/컨테이너 레이어), 로그 디렉토리

---

#### API 응답 시간

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| P50 응답 시간 | 200ms 이하 | 500ms 초과 | 1,000ms 초과 |
| P95 응답 시간 | 1,000ms 이하 | 2,000ms 초과 | 5,000ms 초과 |
| P99 응답 시간 | 3,000ms 이하 | 5,000ms 초과 | 10,000ms 초과 |

> 가정: SSE 스트리밍 엔드포인트(`GET /generation/:jobId/stream`)는 Long-running connection이므로 응답 시간 메트릭에서 제외한다. 단, 첫 번째 SSE 이벤트 도달 시간(TTF — Time to First Event)을 별도로 측정한다 (목표: 3초 이내, `PRD.md` C-UX-11).

---

#### API 에러율

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| 5xx 에러율 | 0~0.5% | 1% 초과 (5분 윈도우) | 5% 초과 (2분 윈도우) |
| 4xx 에러율 | 0~5% | 10% 초과 (비정상 클라이언트 요청 급증) | 20% 초과 |

**측정 대상**: `/api/v1/` 하위 전체 REST 엔드포인트. SSE 엔드포인트 제외.

---

#### DB 커넥션 풀 사용률 (PostgreSQL RDS)

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| `DatabaseConnections` (RDS 메트릭) | 0~70% of max connections | 80% 초과 | 90% 초과 |
| RDS CPU | 0~60% | 75% 초과 | 90% 초과 |
| RDS FreeStorageSpace | 20GB 이상 | 10GB 미만 | 5GB 미만 |

> 가정: 초기 RDS 인스턴스는 `db.t3.medium` (max_connections ≈ 170) 수준으로 가정한다. Prisma 커넥션 풀 기본 설정(connection_limit=5~10)과 조합하여 실제 운영 후 조정 필요.

---

#### Redis (ElastiCache) 메트릭

| 메트릭명 | 정상 범위 | 경고 임계값 | 심각 임계값 |
|---------|----------|-----------|-----------|
| `CurrConnections` | 0~50 | 100 초과 | 200 초과 |
| `BytesUsedForCache` | 0~60% of maxmemory | 75% 초과 | 85% 초과 |
| `CacheHits / (CacheHits + CacheMisses)` | 85% 이상 | 70% 미만 | — |

---

### 1.2 비즈니스 메트릭 알림

`kpi.md`의 Primary KPI를 기반으로 비정상 패턴을 감지한다.

| 메트릭 | 경고 조건 | 대응 |
|--------|---------|------|
| 생성 성공률 (일간) | 24시간 이내 80% 미만으로 하락 | Claude API 상태 확인, 파이프라인 에러 로그 분석 |
| 생성 실패 건수 급증 | 1시간 내 실패 건수 10건 초과 | 즉시 장애 대응 절차 가동 |
| BullMQ 큐 적체 | 대기 중 작업(`status=pending`) 50건 초과 | Worker 인스턴스 증설 또는 Claude API 이슈 확인 |
| 신규 가입 0건 | 24시간 이상 신규 가입 없음 | GitHub OAuth 로그인 흐름(`GET /auth/github/callback`) 또는 사용자 생성 API 동작 확인 |
| 생성 대기 이탈률 과다 | 주간 이탈률 60% 초과 (KPI Kill 기준 — `kpi.md` 실패 신호) | 생성 소요 시간 분석, SSE 이벤트 전달 정상 여부 확인, 대기 중 예상 완료 시간 표시 개선 검토 |

---

### 1.3 알림 채널

| 채널 | 대상 알림 | 도구 |
|------|---------|------|
| Slack `#alert-system` | 경고(Warning) 수준 시스템 메트릭 | AWS CloudWatch Alarm → SNS → Slack Webhook |
| Slack `#alert-critical` | 심각(Critical) 수준 시스템 메트릭, 5xx 급증 | AWS CloudWatch Alarm → SNS → Slack Webhook |
| 담당자 이메일 | 심각 수준 알림 (Slack 미확인 대비 이중화) | AWS SNS → Email |
| Slack `#alert-business` | 비즈니스 메트릭 이상 감지 (생성 실패 급증 등) | 자체 DB 쿼리 배치 → Slack Webhook |

> 가정: 초기 MVP 단계에서 PagerDuty는 사용하지 않는다. Slack + 이메일 이중 알림으로 시작하며, 트래픽 증가 후 PagerDuty 또는 OpsGenie 도입을 검토한다.

---

### 1.4 분석 도구 (GA4)

`kpi.md`의 KPI-P-02(clone URL 클릭률), KPI-S-04(회원가입 완료율) 측정에 Google Analytics 4(GA4)를 사용한다.

| 항목 | 내용 |
|------|------|
| 도구 | Google Analytics 4 |
| 측정 대상 KPI | KPI-P-02 (clone URL 클릭률), KPI-S-04 (GitHub OAuth 로그인 전환율) |
| 주요 이벤트 | `clone_url_copied`, `github_repo_opened`, `github_login_clicked`, 페이지 뷰(`/`, `/history` 등) |
| 점검 주기 | 주간 (KPI 측정 주기와 동일) |

#### GA4 운영 점검 항목

| 점검 항목 | 확인 방법 | 이상 징후 |
|---------|---------|---------|
| 이벤트 수집 여부 | GA4 실시간 보고서에서 `clone_url_copied` 이벤트 발생 확인 | 완료 화면 도달 후 이벤트 0건 → 태깅 오류 의심 |
| 로그인 전환 데이터 수집 | GA4 탐색 보고서 → `github_login_clicked` → 메인 페이지 도달 전환율 확인 | 특정 단계에서 갑작스러운 100% 이탈 → 이벤트 누락 의심 |
| 데이터 스트림 연결 상태 | GA4 관리 → 데이터 스트림 → 최근 48시간 이내 데이터 수신 여부 | 데이터 수신 없음 → `gtag.js` 로드 오류 또는 네트워크 차단 의심 |

> 가정: GA4 태깅은 Frontend 빌드에 포함된다. `VITE_GA4_MEASUREMENT_ID` 환경 변수로 Measurement ID를 주입한다. 광고 차단 확장 프로그램으로 인한 일부 데이터 누락은 허용 오차로 취급한다.

---

## 2. 장애 대응 절차 (Runbook)

### Runbook 001 — 애플리케이션 서버(NestJS) 다운

**증상**
- CloudWatch `5xx 에러율` 알람 발동
- Slack에 `GET /api/v1/...` 전체 엔드포인트 502/503 응답 알림
- Frontend에서 모든 API 호출 실패

**영향 범위**
- 전체 서비스 불가. 로그인, 생성 요청, 이력 조회 모두 불가.
- 진행 중이던 생성 작업(BullMQ 큐)은 Worker가 별도 컨테이너인 경우 계속 실행될 수 있으나, SSE 이벤트 전달 불가로 사용자는 진행 상황 확인 불가.

**즉시 조치**
```bash
# EC2 접속
ssh -i <key.pem> ec2-user@<EC2_IP>

# 컨테이너 상태 확인
docker ps -a | grep backend

# 컨테이너 재시작
docker restart mvp-builder-backend

# 재시작 후 헬스체크
curl http://localhost:3000/api/v1/health
```

**근본 원인 조사**
```bash
# 컨테이너 로그 확인 (최근 200줄)
docker logs mvp-builder-backend --tail 200

# AWS CloudWatch에서 ERROR 레벨 로그 필터링
# 로그 그룹: /mvp-builder/backend
# 필터 패턴: { $.level = "ERROR" }

# OOM(Out of Memory) 확인
docker inspect mvp-builder-backend | grep -i oom
```

**복구 확인**
- `GET /api/v1/health` 응답 200 OK
- CloudWatch 5xx 에러율 0으로 복귀
- Slack 알람 해소 확인

---

### Runbook 002 — 데이터베이스(PostgreSQL RDS) 연결 실패

**증상**
- CloudWatch `DatabaseConnections` 급감 또는 0
- Backend 로그에 `PrismaClientKnownRequestError: Can't reach database server` 반복
- API 전체 500 에러 (DB 의존 엔드포인트)

**영향 범위**
- 로그인, 회원가입, 생성 요청, 이력 조회 전체 불가.
- 이미 큐에 있는 생성 작업은 DB 업데이트 실패로 `failed` 상태 처리 불가.

**즉시 조치**
```bash
# RDS 인스턴스 상태 확인 (AWS Console 또는 CLI)
aws rds describe-db-instances --db-instance-identifier mvp-builder-db \
  --query 'DBInstances[0].DBInstanceStatus'

# 연결 테스트 (EC2에서)
nc -zv <RDS_ENDPOINT> 5432

# Backend 컨테이너 환경 변수 DATABASE_URL 확인
docker exec mvp-builder-backend env | grep DATABASE_URL
```

**RDS 재시작 (불가피한 경우)**
```bash
aws rds reboot-db-instance --db-instance-identifier mvp-builder-db
```

**근본 원인 조사**
- AWS RDS Console → Events 탭에서 최근 이벤트 확인
- CloudWatch `RDS > DatabaseConnections`, `FreeStorageSpace`, `CPUUtilization` 그래프 확인
- Prisma 커넥션 풀 소진 여부 확인 (Backend 로그에서 `connection pool timeout` 검색)
- 보안 그룹(Security Group) 규칙 변경 여부 확인

**복구 확인**
- RDS 인스턴스 상태 `available`
- `GET /api/v1/health` 응답에 DB 연결 정상 표시
- `POST /auth/login` 정상 작동 확인

---

### Runbook 003 — 외부 API 장애

#### 3-A Claude API (Anthropic) 장애

**증상**
- Backend 로그에 `AnthropicError` 또는 `status 529 Overloaded` 반복
- 생성 작업이 모두 `failed` 상태로 전환
- KPI-P-01 생성 성공률 급락 알람

**영향 범위**
- 신규 MVP 생성 전체 불가. 인증, 이력 조회 등 Claude API 미의존 기능은 정상 작동.

**즉시 조치**
1. Anthropic 상태 페이지 확인: `https://status.anthropic.com`
2. 장애가 Anthropic 측 문제임을 확인하면 BullMQ 큐에서 새 작업 수신 임시 중단 검토
3. 사용자 대상 서비스 공지 (랜딩 페이지 또는 이메일)
4. 재시도 로직(최대 3회, exponential backoff — C-CODE-15) 동작 여부 확인

**근본 원인 조사**
- Backend 로그 필터: `{ $.service = "AgentModule" && $.level = "ERROR" }`
- Claude API 호출 소요 시간 로그 확인 (C-INFRA-12)
- Anthropic API 할당량(rate limit) 초과 여부 확인

**복구 확인**
- Anthropic 상태 페이지 `All Systems Operational`
- 테스트 생성 요청 1건 성공 확인
- BullMQ 큐 재개 후 생성 성공률 회복 확인

---

#### 3-B GitHub API 장애

**증상**
- Backend 로그에 `RequestError: GitHub API 404/500` 반복
- 생성 파이프라인의 `uploading` 단계에서 실패, SSE `error` 이벤트 발행
- `generations` 테이블에서 `current_stage=uploading`, `status=failed` 건수 급증

**영향 범위**
- 코드 생성은 완료되었으나 GitHub repo 생성 및 파일 업로드 불가. clone URL 발급 불가.

**즉시 조치**
1. GitHub 상태 페이지 확인: `https://www.githubstatus.com`
2. 특정 사용자에서 반복 실패하는지 또는 전체 사용자에서 실패하는지 로그로 구분
3. GitHub API rate limit 초과 여부 확인: `https://api.github.com/rate_limit` (해당 사용자 token 사용)

```bash
# 특정 사용자 GitHub token으로 rate limit 확인 (users 테이블에서 복호화된 token 사용)
curl -H "Authorization: Bearer <USER_GITHUB_ACCESS_TOKEN>" \
  https://api.github.com/rate_limit
```

**근본 원인 조사**
- Backend 로그 필터: `{ $.service = "GithubModule" && $.level = "ERROR" }`
- `C-CODE-16`: GitHub API 호출 실패 시 SSE error 이벤트 발행 확인
- 사용자 GitHub OAuth token 만료 또는 권한 변경 여부 확인 (사용자가 OAuth App 권한을 취소한 경우)
- repo 네이밍 충돌(`mvp-{keyword}-{username}` 중복) 여부 확인

**복구 확인**
- GitHub API rate limit 리셋 후 테스트 repo 생성 성공
- 이후 생성 요청에서 `uploading` 단계 정상 통과 확인

---

#### 3-C GitHub OAuth 장애 (로그인 불가)

**증상**
- 랜딩 페이지에서 "GitHub으로 시작하기" 클릭 후 에러 페이지로 이동
- Backend 로그에 `passport-github2 Error` 또는 `GitHub OAuth callback error` 반복
- `GET /auth/github/callback` 엔드포인트 4xx/5xx 에러 급증

**영향 범위**
- 신규 로그인 및 회원 가입 전체 불가. 기존 JWT가 유효한 사용자의 API 접근은 Access Token 만료 전까지 정상.

**즉시 조치**
1. GitHub 상태 페이지 확인: `https://www.githubstatus.com` (OAuth 관련 인시던트 여부)
2. GitHub OAuth App 설정 확인 (GitHub → Settings → Developer settings → OAuth Apps)
   - Callback URL이 `GITHUB_OAUTH_CALLBACK_URL` 환경 변수 값과 일치하는지 확인
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` 만료 또는 재설정 여부 확인
3. Backend 환경 변수 로드 확인

**근본 원인 조사**
- Backend 로그 필터: `{ $.service = "AuthModule" && $.level = "ERROR" }`
- `GITHUB_CLIENT_SECRET` 만료 또는 OAuth App 권한 변경 여부 확인
- GitHub OAuth App의 `Authorization callback URL` 설정이 프로덕션 URL과 일치하는지 확인

**복구 확인**
- `GET /auth/github` → GitHub OAuth 동의 화면 정상 표시 확인
- 테스트 계정으로 로그인 전체 흐름 성공 확인

---

### Runbook 004 — Redis (ElastiCache) 장애

**증상**
- BullMQ 관련 Backend 로그에 `Connection to Redis failed` 반복
- 새 생성 요청 `POST /generation` 큐잉 실패 → 500 에러
- 진행 중인 생성 작업 상태 업데이트 불가

**영향 범위**
- 신규 MVP 생성 요청 전체 불가. 인증(GitHub OAuth, JWT 검증)은 Redis 미의존으로 동작하므로 로그인/로그아웃은 정상 작동 가능.

**즉시 조치**
```bash
# ElastiCache Redis 연결 테스트 (EC2에서)
redis-cli -h <ELASTICACHE_ENDPOINT> -p 6379 ping

# AWS Console에서 ElastiCache 클러스터 상태 확인
aws elasticache describe-cache-clusters \
  --cache-cluster-id mvp-builder-redis \
  --show-cache-node-info
```

**근본 원인 조사**
- AWS CloudWatch → ElastiCache 메트릭에서 `BytesUsedForCache`, `Evictions`, `CurrConnections` 확인
- Redis `maxmemory-policy` 설정으로 인한 데이터 eviction 여부 확인
- BullMQ 큐에 쌓인 작업 수(`BullMQ.waiting`, `BullMQ.active`) 확인

**복구 확인**
- `redis-cli ping` → `PONG` 응답
- Backend 로그에서 Redis 연결 성공 메시지 확인
- `POST /generation` 테스트 요청 201 응답 확인

---

### Runbook 005 — 디스크 / 스토리지 부족

**증상**
- CloudWatch `disk_used_percent` 90% 초과 알람
- Docker 로그 작성 실패 또는 이미지 풀 실패
- Backend/Frontend 컨테이너 재시작 루프

**영향 범위**
- 디스크 풀 상태 도달 시 전체 서비스 불가.

**즉시 조치**
```bash
# 디스크 사용량 확인
df -h
du -sh /var/lib/docker/* | sort -rh | head -20

# Docker 미사용 리소스 정리 (주의: 실행 중 컨테이너 영향 없음)
docker system prune -f

# 오래된 로그 파일 정리 (CloudWatch로 수집된 로그는 삭제 가능)
find /var/log -name "*.log" -mtime +7 -delete

# Docker 이미지 정리 (현재 사용 중인 이미지 제외)
docker image prune -a -f
```

**근본 원인 조사**
- 어떤 디렉토리가 디스크를 가장 많이 사용하는지 확인
- Docker 로그 크기 확인 (`/var/lib/docker/containers/*/...log`)
- Docker 로그 rotate 설정 확인 (`/etc/docker/daemon.json`)

**장기 대응**
```json
// /etc/docker/daemon.json — 로그 로테이션 설정 예시
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

- EC2 EBS 볼륨 크기 증설 (`aws ec2 modify-volume` 또는 Console)

**복구 확인**
- `df -h` 에서 사용률 70% 이하 확인
- 컨테이너 정상 동작 확인

---

## 3. 환경 변수 및 시크릿 목록

아래 변수들은 실제 값을 절대 코드나 문서에 포함하지 않는다. `.env.example` 파일에 형식만 포함하고, 실제 값은 환경별 시크릿 관리 도구로 관리한다.

### 3.1 Backend 환경 변수

| 변수명 | 설명 | 필수 여부 | 예시 값 (형식만) | 관리 방식 |
|--------|------|----------|---------------|---------|
| `NODE_ENV` | 실행 환경 | 필수 | `production` | 환경 변수 |
| `PORT` | NestJS 서버 포트 | 필수 | `3000` | 환경 변수 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 필수 | `postgresql://user:pass@host:5432/dbname?schema=public` | AWS Secrets Manager |
| `REDIS_URL` | Redis 연결 문자열 | 필수 | `redis://host:6379` | AWS Secrets Manager |
| `JWT_SECRET` | Access Token JWT 서명 키 (최소 32자 랜덤 문자열) | 필수 | `your-secret-key-minimum-32-chars` | AWS Secrets Manager |
| `JWT_EXPIRES_IN` | Access Token 만료 시간 | 필수 | `15m` | 환경 변수 |
| `ANTHROPIC_API_KEY` | Claude API key (운영자 소유) | 필수 | `sk-ant-api03-...` | AWS Secrets Manager |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | 필수 | `Ov23liXXXXXXXXX` | AWS Secrets Manager |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | 필수 | `your-client-secret` | AWS Secrets Manager |
| `GITHUB_OAUTH_CALLBACK_URL` | GitHub OAuth 콜백 URL | 필수 | `https://api.mvp-builder.com/api/v1/auth/github/callback` | 환경 변수 |
| `ENCRYPTION_KEY` | GitHub OAuth token AES-256-GCM 암호화 키 (32바이트) | 필수 | `your-32-byte-encryption-key` | AWS Secrets Manager |
| `APP_URL` | 서비스 공개 URL | 필수 | `https://mvp-builder.com` | 환경 변수 |
| `FRONTEND_URL` | Frontend URL (CORS 허용 Origin, OAuth 리다이렉트 대상) | 필수 | `https://mvp-builder.com` | 환경 변수 |
| `GENERATION_TIMEOUT_MINUTES` | 생성 타임아웃 시간(분) | 선택 | `15` | 환경 변수 |
| `BULLMQ_CONCURRENCY` | BullMQ Worker 동시 처리 수 | 선택 | `5` | 환경 변수 |

### 3.2 Frontend 환경 변수

| 변수명 | 설명 | 필수 여부 | 예시 값 (형식만) | 관리 방식 |
|--------|------|----------|---------------|---------|
| `VITE_API_BASE_URL` | Backend API Base URL | 필수 | `https://api.mvp-builder.com/api/v1` | 환경 변수 (빌드 시 주입) |
| `VITE_GA4_MEASUREMENT_ID` | Google Analytics 4 Measurement ID (KPI-P-02, KPI-S-04 측정용) | 필수 | `G-XXXXXXXXXX` | 환경 변수 (빌드 시 주입) |

> 가정: Frontend 환경 변수는 Vite 빌드 시 정적으로 주입된다. `VITE_` 접두어가 없는 변수는 클라이언트에 노출되지 않는다. API 인증 정보(토큰 등)는 절대 Frontend 환경 변수에 포함하지 않는다.

### 3.3 환경별 관리 방식 요약

| 환경 | 관리 방식 |
|------|---------|
| 로컬 개발 (local) | `.env` 파일 (`apps/backend/.env`). `.gitignore`에 포함. `.env.example`만 저장소에 커밋. |
| 스테이징 (staging) | AWS Secrets Manager (프로덕션과 별도 시크릿 경로: `/mvp-builder/staging/`) |
| 프로덕션 (production) | AWS Secrets Manager (경로: `/mvp-builder/production/`) |

---

## 4. 백업 및 복구 정책

`erd.md`의 데이터 모델(`users`, `generations`)을 기반으로 작성한다.

### 4.1 백업 대상

| 대상 | 유형 | 비고 |
|------|------|------|
| PostgreSQL (RDS) | 메인 데이터 | 사용자 계정(`users`), 생성 이력(`generations`) 전체 포함 |
| Redis (ElastiCache) | 큐 데이터 (BullMQ) | 큐 데이터는 ephemeral하게 취급. 장애 시 재생성 요청으로 복구. |
| AWS Secrets Manager | 시크릿 | AWS 자체 관리 (버전 관리 내장) |
| GitHub Actions 워크플로 | CI/CD 설정 | Git 저장소에 포함됨 (`/.github/workflows/`) |

> 가정: 생성된 MVP 코드 결과물은 GitHub 저장소에 저장되며, mvp-builder 서비스의 별도 백업 대상이 아니다. `generations` 테이블의 `clone_url`, `repo_name` 필드가 참조 정보를 유지한다.

---

### 4.2 백업 주기 및 보존 기간

#### PostgreSQL (AWS RDS)

| 백업 유형 | 주기 | 보존 기간 | 방법 |
|----------|------|---------|------|
| 자동 스냅샷 | 매일 1회 (새벽 3시 UTC) | 7일 | AWS RDS 자동 백업 활성화 |
| 수동 스냅샷 | 주요 배포 전/후 | 30일 | 수동 트리거 (`aws rds create-db-snapshot`) |
| Multi-AZ 동기 복제 | 실시간 | — | RDS Multi-AZ 활성화 (장애 시 자동 Failover) |

> 가정: 초기 MVP에서는 비용 절감을 위해 Multi-AZ 미적용으로 시작할 수 있다. 트래픽 증가 또는 첫 번째 장애 발생 후 활성화를 검토한다. Multi-AZ 미적용 시 RTO가 길어질 수 있다.

#### Redis (ElastiCache)

| 백업 유형 | 주기 | 보존 기간 | 방법 |
|----------|------|---------|------|
| RDB 스냅샷 | 매일 1회 | 3일 | ElastiCache Backup 활성화 |

> 가정: BullMQ 큐 데이터는 진행 중인 생성 작업 상태만 포함한다. Redis 장애 시 처리 중이던 작업은 `generations` 테이블에서 `status=processing`인 건을 수동으로 `failed`로 업데이트하고 재시작한다.

---

### 4.3 복구 절차

#### PostgreSQL RDS 복구 (RDS 스냅샷에서 복원)

```bash
# 1. 사용 가능한 스냅샷 목록 확인
aws rds describe-db-snapshots \
  --db-instance-identifier mvp-builder-db \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]'

# 2. 스냅샷에서 새 DB 인스턴스 복원
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier mvp-builder-db-restored \
  --db-snapshot-identifier <snapshot-identifier> \
  --db-instance-class db.t3.medium \
  --no-multi-az

# 3. 복원된 인스턴스가 available 상태가 될 때까지 대기 (15~30분)
aws rds wait db-instance-available \
  --db-instance-identifier mvp-builder-db-restored

# 4. DATABASE_URL 환경 변수를 복원된 인스턴스 엔드포인트로 업데이트
# AWS Secrets Manager에서 DATABASE_URL 값 수정

# 5. Backend 컨테이너 재시작 (새 DATABASE_URL 로드)
docker restart mvp-builder-backend

# 6. Prisma 마이그레이션 상태 확인
docker exec mvp-builder-backend npx prisma migrate status
```

---

### 4.4 RTO / RPO 목표

| 항목 | 목표 | 비고 |
|------|------|------|
| RTO (Recovery Time Objective) | 2시간 이내 | 수동 복구 절차 기준 |
| RPO (Recovery Point Objective) | 24시간 이내 | 일간 자동 스냅샷 기준 |

> 가정: 초기 MVP 단계에서 RTO 2시간, RPO 24시간은 허용 가능한 수준으로 설정했다. SLA를 약정한 B2B 서비스가 아닌 개인/개발자 대상 서비스이므로 비용 대비 합리적인 수준이다. Multi-AZ 활성화 시 RTO를 30분 이내로 단축 가능하다.

---

## 5. 배포 절차

### 5.1 배포 환경

| 환경 | 용도 | 접근 방식 | URL |
|------|------|---------|-----|
| 로컬 개발 (local) | 개발자 개인 로컬 환경. 기능 개발 및 단위 테스트. | `docker-compose up` | `http://localhost:5173` (FE), `http://localhost:3000` (BE) |
| 프로덕션 (production) | 실제 사용자 서비스. `main` 브랜치 기준. | GitHub Actions → AWS EC2 SSH 배포 | `https://mvp-builder.com` |

> 가정: `MVP-scope.md`에서 "스테이징 환경 자동화는 MVP 출시 후 v1.1에서 도입"으로 결정했다. 초기에는 로컬 + 프로덕션 2개 환경으로 운영한다.

---

### 5.2 배포 프로세스

#### 정상 배포 흐름 (GitHub Actions)

```
1. 개발자가 feature 브랜치에서 작업 완료
   └── PR 생성 → GitHub Actions CI 트리거

2. CI 파이프라인 (PR 검사 — C-INFRA-05)
   ├── lint (ESLint + Prettier)
   ├── unit test (Jest, Vitest)
   └── integration test (Jest + Supertest)
   * 하나라도 실패 시 배포 차단 (C-INFRA-07)

3. 코드 리뷰 및 PR 승인 후 main 브랜치로 머지

4. CD 파이프라인 (main 브랜치 push 시 자동 트리거 — C-INFRA-06)
   ├── Docker multi-stage build (Backend, Frontend)
   ├── Docker Hub 또는 AWS ECR에 이미지 push
   ├── EC2에 SSH 접속
   ├── docker pull (새 이미지)
   ├── Prisma 마이그레이션 실행 (`prisma migrate deploy`)
   ├── docker-compose up -d --no-deps (Zero-downtime 최대한 유지)
   └── 헬스체크: GET /api/v1/health 응답 확인
```

#### 수동 배포 (긴급 핫픽스)

```bash
# EC2 접속
ssh -i <key.pem> ec2-user@<EC2_IP>

# 최신 이미지 풀
docker pull <REGISTRY>/mvp-builder-backend:latest
docker pull <REGISTRY>/mvp-builder-frontend:latest

# Prisma 마이그레이션 (스키마 변경이 있는 경우)
docker run --rm --env-file .env \
  <REGISTRY>/mvp-builder-backend:latest \
  npx prisma migrate deploy

# 서비스 재시작
docker-compose up -d --no-deps backend frontend

# 헬스체크
curl http://localhost:3000/api/v1/health
```

---

### 5.3 롤백 절차

#### 자동 롤백 (GitHub Actions)

배포 후 헬스체크 실패 시 GitHub Actions 워크플로에서 자동으로 이전 이미지 태그로 롤백을 수행한다.

> 가정: CI/CD 파이프라인에 자동 롤백 스텝을 포함해야 한다. 이미지 태그는 커밋 SHA를 사용하여 이전 버전으로 정확히 되돌릴 수 있도록 한다.

#### 수동 롤백

```bash
# EC2 접속
ssh -i <key.pem> ec2-user@<EC2_IP>

# 사용 가능한 이미지 태그 확인 (최근 3개)
docker images <REGISTRY>/mvp-builder-backend | head -5

# 이전 버전 이미지 태그로 롤백
# 예: 커밋 SHA가 abc123인 이전 버전으로 롤백
docker-compose stop backend frontend
docker tag <REGISTRY>/mvp-builder-backend:<이전_커밋_SHA> \
           <REGISTRY>/mvp-builder-backend:rollback
docker-compose up -d --no-deps backend frontend

# 헬스체크
curl http://localhost:3000/api/v1/health

# 데이터베이스 마이그레이션 롤백 (스키마 변경이 있었던 경우)
# 주의: 데이터 손실 가능성 있음. 반드시 DBA 확인 후 진행.
docker exec mvp-builder-backend npx prisma migrate status
# 롤백 대상 마이그레이션 확인 후 수동 SQL 실행
```

> 가정: Prisma는 마이그레이션 다운그레이드를 자동 지원하지 않는다. 스키마 변경이 포함된 배포의 경우 롤백 전 데이터 영향도를 반드시 확인한다. 가급적 후방 호환(backward-compatible) 마이그레이션 전략을 사용한다.

---

### 5.4 배포 체크리스트

배포 전 아래 항목을 순서대로 확인한다.

#### 배포 전 확인

- [ ] PR 기반 CI 파이프라인 (lint + test) 전체 통과 확인
- [ ] 데이터베이스 마이그레이션 파일 변경 여부 확인 (`prisma/migrations/` 디렉토리)
  - 마이그레이션이 있는 경우: 스키마 변경 내용 검토, 데이터 손실 없음 확인
  - 새 NOT NULL 컬럼 추가 시: DEFAULT 값 또는 마이그레이션 전 데이터 백업 확인
- [ ] 새로운 환경 변수 추가 여부 확인
  - 추가된 환경 변수가 있으면 AWS Secrets Manager / EC2 환경에 먼저 등록
  - `.env.example` 업데이트 여부 확인
- [ ] 의존성 패키지 변경 여부 확인 (`package.json` diff)
  - 보안 취약점 패키지 포함 여부 (`npm audit` 결과)
- [ ] 외부 API(Claude API, GitHub API) 연동 변경 여부 확인
  - API 버전 변경 또는 엔드포인트 변경 시 사전 테스트 필요
- [ ] RDS 수동 스냅샷 생성 (스키마 변경 포함 배포 시)
  ```bash
  aws rds create-db-snapshot \
    --db-instance-identifier mvp-builder-db \
    --db-snapshot-identifier mvp-builder-db-pre-deploy-$(date +%Y%m%d%H%M)
  ```

#### 배포 중 확인

- [ ] GitHub Actions CD 파이프라인 실행 모니터링
- [ ] 배포 중 CloudWatch 5xx 에러율 모니터링
- [ ] Prisma 마이그레이션 실행 로그 확인 (마이그레이션 포함 배포 시)

#### 배포 후 확인

- [ ] `GET /api/v1/health` 응답 200 OK 확인
- [ ] 핵심 API 스모크 테스트
  - `POST /auth/login` (로그인)
  - `POST /generation` (생성 요청)
  - `GET /generation` (이력 조회)
- [ ] CloudWatch 에러율 5분간 모니터링 (5xx 급증 없음 확인)
- [ ] BullMQ 큐 정상 동작 확인 (새 생성 작업 enqueue/dequeue)
- [ ] 배포 완료 Slack 공지 (채널: `#deploy`)
