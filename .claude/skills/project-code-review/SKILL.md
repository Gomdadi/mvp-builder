---
name: project-code-review
description: NestJS/TypeScript 백엔드 코드 리뷰를 수행한다. .ts 파일 생성·수정 후 자동 트리거(PostToolUse 훅)되거나, 사용자가 "리뷰", "코드 리뷰", "review" 요청 시 수동으로 사용한다. TypeScript 타입 오류, NestJS 패턴 위반, BullMQ/TypeORM 관용구, 보안 취약점, CLAUDE.md 코딩 가이드라인 준수 여부를 검토한다.
---

# Project Code Review

## 워크플로우

1. **변경 파일 파악**: `git diff --name-only HEAD` 또는 훅이 전달한 파일 경로로 리뷰 대상 확정
2. **타입 검사**: `cd apps/backend && npx tsc --noEmit 2>&1`
3. **린트**: `cd apps/backend && npm run lint 2>&1`
4. **코드 검토**: 아래 체크리스트 기준으로 변경 코드를 직접 읽고 리뷰
5. **결과 보고**: 오류·경고·권고 항목을 파일:라인 형식으로 출력. 자동 수정 가능한 항목은 바로 수정

## NestJS / TypeORM / BullMQ 체크리스트

### 필수 패턴

- **엔티티 프로퍼티**: TypeORM 엔티티 필드에 `!` (definite assignment assertion) 사용 확인
- **DI 데코레이터**: `@Injectable()`, `@InjectRepository(Entity)`, `@InjectQueue(QUEUE_NAME)` 누락 여부
- **Repository 메서드**: `findOne` 결과 null 체크 또는 `findOneOrFail` 사용 확인
- **BullMQ 에러 전파**: Worker `catch` 블록에서 `throw e` 포함 여부 (BullMQ retry 트리거용)
- **S3 키 패턴**: `generatedKey()` 함수를 거치지 않고 키를 직접 조립하면 안 됨

### 금지 패턴

- **`any` 타입 캐스트 남용**: `as any` 사용 시 대안 검토
- **중복 에러 처리**: 불가능한 시나리오에 대한 방어 코드 (CLAUDE.md "단순함 우선" 원칙)
- **불필요한 추상화**: 한 곳에서만 쓰이는 helper 함수·유틸리티 신설

### 보안

- TypeORM QueryBuilder 사용 시 파라미터 바인딩 확인 (SQL injection 방지)
- 환경변수로 관리해야 할 값이 하드코딩되어 있지 않은지 확인

## 주석 원칙 확인 (CLAUDE.md)

변경된 코드에 다음이 누락되어 있으면 지적한다:
- 클래스·메서드: 목적·동작 흐름·전제조건 주석
- 복잡한 로직 또는 NestJS/BullMQ 비자명 동작: 인라인 주석
- 각 필드·옵션·분기의 의미를 설명하는 줄 주석

## 출력 형식

```
## 코드 리뷰 결과

### 오류 (즉시 수정 필요)
- `src/pipeline/task.worker.ts:45` — BullMQ retry 트리거를 위한 `throw e` 누락

### 경고 (권고)
- `src/claude/phase4.service.ts:30` — `as any` 캐스트. unknown → 타입 가드 검토

### 통과
- TypeScript 타입 오류 없음
- 린트 오류 없음
```

오류가 없으면 "✅ 리뷰 통과 — 발견된 이슈 없음" 한 줄로 종료한다.
