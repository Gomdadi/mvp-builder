# 문서 정합성 검토 리포트

---

## 회차 1 — 2026-04-10

### CP-1. PRD ↔ MVP-scope 기능 범위 일치
**결과**: [이상 없음]
PRD F-01~F-10과 MVP-scope In-scope F-01~F-10이 완벽히 대응됨.

### CP-2. PRD/MVP-scope ↔ tech-stack 기술 스택 일치
**결과**: [이상 없음]
PRD 지원 플랫폼 기술과 tech-stack.md 선택이 완벽히 일치.

### CP-3. PRD/MVP-scope ↔ system-architecture 컴포넌트 완전성
**결과**: [이상 없음]
Must-have 기능 F-01~F-10이 system-architecture 컴포넌트 및 데이터 흐름에 모두 반영됨.

### CP-4. tech-stack ↔ system-architecture 구현 일치
**결과**: [이상 없음]
tech-stack의 모든 주요 라이브러리가 system-architecture에서 역할 부여됨.

### CP-5. ERD ↔ API spec 데이터 모델 일치
**결과**: [이상 없음]
API request/response 필드와 ERD 컬럼이 대응되며, projects.status 가능 값이 양쪽에서 일치함.
SSE 이벤트 타입(7종)이 api-spec에 정의되어 있으나 system-architecture에서 추상적으로만 기술됨 — 표현 차이로 모순 없음.

### CP-6. ERD ↔ KPI 측정 가능성
**결과**: [이상 없음]
KPI 계산식이 참조하는 모든 컬럼(projects.status, analysis_documents.version/is_confirmed, pipeline_runs.started_at, users.encrypted_api_key 등)이 ERD에 존재.

### CP-7. API spec ↔ wireframe/user-flow 화면-API 연결 일치
**결과**: [이상 없음]
wireframe S1~S8이 호출하는 모든 API 엔드포인트가 api-spec에 정의됨.

### CP-8. wireframe ↔ user-flow 화면 전환 일치
**결과**: [이상 없음]
S1~S8 인벤토리가 user-flow 4개 시나리오에서 빠짐없이 참조되며, 화면 전환 경로가 일치.

### CP-9. user-persona ↔ user-flow 페르소나 일관성
**결과**: [이상 없음]
박민준, 이수연, 김태원 세 페르소나가 user-flow 시나리오에서 정확히 동일한 이름으로 사용됨.

### CP-10. PRD/MVP-scope ↔ KPI 목표 수치 일치
**결과**: [이상 없음]
PRD의 Phase 1 60초 이내와 KPI의 전체 파이프라인 10분 이내는 서로 다른 범위이므로 모순 없음.
API 응답 2초(P95) 목표는 operations-guide 모니터링 임계값과 일치.

### CP-11. operations-guide ↔ system-architecture/tech-stack 운영 일치
**결과**: [누락]

**발견된 이슈**:
- **이슈 11-1**: NestJS 모듈(AuthModule, ProjectModule, PipelineModule) 개별 장애 시나리오 누락
  - 영향 범위: 인증 장애, CRUD 에러, 파이프라인 실패 시 운영 대응 방법 미정의
  - 권장 조치: operations-guide.md에 인증 모듈 장애 시나리오(SC-06) 추가
- **이슈 11-2**: Claude API 호출 설정(timeout, retry) 환경 변수 누락
  - 영향 범위: 운영 시 Claude API 타임아웃 조정 불가
  - 권장 조치: `CLAUDE_API_TIMEOUT`, `CLAUDE_API_MAX_RETRIES` 환경 변수 추가

### CP-12. operations-guide ↔ KPI 측정-모니터링 연결
**결과**: [이상 없음]
KPI 측정 방법(자체 DB 쿼리)과 operations-guide 모니터링(시스템 메트릭 + 비즈니스 메트릭)이 상호 보완적으로 연결됨.

### CP-13. constitution 보안 원칙 ↔ API spec/ERD/system-architecture 준수
**결과**: [불일치]

**발견된 이슈**:
- **이슈 13-1**: API 엔드포인트별 인증 필수 여부 명확화 필요 [불일치]
  - 현재: auth 관련 2개 엔드포인트만 공개로 표시, 나머지 엔드포인트에 명시 없음
  - 권장 조치: api-spec.md 각 엔드포인트에 `[인증 필수]` / `[공개]` 레이블 추가
- **이슈 13-2**: 분석 문서(analysis_documents) 암호화 필요성 미결정 [누락]
  - 현재: ERD의 analysis_documents에 암호화 컬럼 표시 없음. 사용자 프로젝트 요구사항 포함
  - 권장 조치: constitution C-SEC-02 기준으로 민감도 판단 후 암호화 또는 > ⚠️ 확인 필요 주석 추가
- **이슈 13-3**: API 요청 필드 검증 규칙(min/max length, regex) 미정의 [누락]
  - 현재: api-spec.md의 Request Body에 필드 목록만 있고 검증 규칙 없음
  - 권장 조치: requirements, name 등 핵심 필드에 검증 규칙 명시
- **이슈 13-4**: 운영 환경 DATABASE_URL, REDIS_URL의 Secrets Manager 관리 여부 미명시 [누락]
  - 현재: operations-guide.md에서 두 변수를 "환경 변수"로만 분류
  - 권장 조치: 운영 환경에서는 Secrets Manager 주입으로 명시

---

### 요약

| 체크포인트 | 결과 | 이슈 수 |
|-----------|------|--------|
| CP-1. PRD ↔ MVP-scope | 이상 없음 | 0 |
| CP-2. PRD/MVP-scope ↔ tech-stack | 이상 없음 | 0 |
| CP-3. PRD/MVP-scope ↔ system-architecture | 이상 없음 | 0 |
| CP-4. tech-stack ↔ system-architecture | 이상 없음 | 0 |
| CP-5. ERD ↔ API spec | 이상 없음 | 0 |
| CP-6. ERD ↔ KPI | 이상 없음 | 0 |
| CP-7. API spec ↔ wireframe/user-flow | 이상 없음 | 0 |
| CP-8. wireframe ↔ user-flow | 이상 없음 | 0 |
| CP-9. user-persona ↔ user-flow | 이상 없음 | 0 |
| CP-10. PRD/MVP-scope ↔ KPI | 이상 없음 | 0 |
| CP-11. operations-guide ↔ system-architecture/tech-stack | 누락 | 2 |
| CP-12. operations-guide ↔ KPI | 이상 없음 | 0 |
| CP-13. constitution 보안 원칙 ↔ API spec/ERD/architecture | 불일치 | 4 |

**총 이슈**: 6건 (불일치 1 / 누락 5)

**상태**: 수정 필요

---

### 수정 결과 (7-doc-consistency-fixer)

| 이슈 ID | 분류 | 수정 대상 파일 | 처리 결과 |
|---------|------|---------------|-----------|
| CP-13-이슈-1 | [불일치] | `docs/03/api-spec.md` | 전체 엔드포인트에 `[인증 필수]` / `[공개]` 레이블 추가 완료 |
| CP-13-이슈-2 | [누락] | `docs/03/erd.md` | `analysis_documents`에 `> ⚠️ 확인 필요` 주석 추가 완료 |
| CP-13-이슈-3 | [누락] | `docs/03/api-spec.md` | `POST /v1/projects` Request에 검증 규칙 추가 완료 |
| CP-13-이슈-4 | [누락] | `docs/05/operations-guide.md` | DATABASE_URL/REDIS_URL 운영 환경 Secrets Manager 명시 완료 |
| CP-11-이슈-1 | [누락] | `docs/05/operations-guide.md` | 시나리오 6(AuthModule), 7(PipelineModule) 장애 시나리오 추가 완료 |
| CP-11-이슈-2 | [누락] | `docs/05/operations-guide.md` | CLAUDE_API_TIMEOUT, CLAUDE_API_MAX_RETRIES 환경 변수 추가 완료 |

**미처리 이슈**: 0건

**다음 단계**: `6-doc-consistency-checker`를 재실행하여 잔여 이슈를 확인하세요.

---

## 회차 2 — 2026-04-10

> 이전 회차 이슈 중 수정된 항목: CP-11-이슈-1, CP-11-이슈-2, CP-13-이슈-1, CP-13-이슈-2, CP-13-이슈-3, CP-13-이슈-4 (6건 전체)
> 이번 회차 신규 이슈: 0건

회차 1에서 수정된 6건의 이슈를 재검토한 결과, 모든 항목이 올바르게 수정되었음을 확인:
- api-spec.md: 전체 엔드포인트에 인증 레이블 추가 ✓
- api-spec.md: POST /v1/projects Request 검증 규칙 추가 ✓
- erd.md: analysis_documents 암호화 검토 주석 추가 ✓
- operations-guide.md: 장애 시나리오 6, 7 추가 ✓
- operations-guide.md: Claude API 환경 변수 추가 ✓
- operations-guide.md: DATABASE_URL/REDIS_URL 운영 관리 방식 명시 ✓

**총 이슈**: 0건

**상태**: 완료
