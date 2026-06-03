---
name: nestjs-dto-test
description: "NestJS DTO의 class-validator 검증 테스트(*.dto.spec.ts)를 작성한다. validate()와 plainToInstance()를 사용하여 DTO 제약 조건을 직접 검증한다. 키워드: DTO test, class-validator 테스트, validate, plainToInstance, 유효성 검증"
---

# NestJS DTO Validation 테스트

## 트리거
- `*.dto.spec.ts` 작성
- DTO 제약 조건(필수 필드, 타입, enum 범위 등) 검증
- class-validator 데코레이터 동작 확인

## 작성 워크플로우

1. **import** — `validate`, `plainToInstance` 불러오기
   ```ts
   import { validate } from 'class-validator';
   import { plainToInstance } from 'class-transformer';
   ```

2. **테스트 패턴** — 각 케이스마다 `plainToInstance` → `validate` 순서
   ```ts
   const dto = plainToInstance(CreateXxxDto, plainObject);
   const errors = await validate(dto);
   ```

3. **테스트 케이스 구성**
   - 유효한 입력 → `errors.length === 0`
   - 필수 필드 누락 → `errors.length > 0`, 해당 필드 에러 포함
   - 타입 불일치 → 에러 포함
   - Enum 범위 초과 → 에러 포함
   - 선택 필드 생략 → 에러 없음

4. **에러 필드 특정 검증**
   ```ts
   expect(errors.some(e => e.property === 'fieldName')).toBe(true);
   ```

## 체크리스트

- [ ] `plainToInstance()` 사용 (plain object 직접 전달 시 decorator 미적용)
- [ ] 각 케이스: 유효 입력 / 필드 누락 / 타입 오류 / 선택 필드 생략
- [ ] Enum 필드는 유효값과 유효하지 않은 값 모두 테스트
- [ ] `errors.length`로 통과/실패 검증

## 패턴 참조

→ `references/patterns.md`
