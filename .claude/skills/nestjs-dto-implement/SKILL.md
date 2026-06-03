---
name: nestjs-dto-implement
description: "NestJS DTO 파일(*.dto.ts)을 작성한다. class-validator 데코레이터로 요청 검증, 응답 DTO 정의, 중첩 객체 변환이 필요할 때 사용한다. 키워드: DTO 구현, class-validator, @IsString @IsOptional @IsEnum, Request/Response DTO"
---

# NestJS DTO 구현

## 트리거
- 요청 body 검증이 필요한 엔드포인트
- `*.dto.ts` 신규 작성
- 응답 스키마 정의 (엔티티 전체 반환 대신 필요한 필드만)

## 구현 워크플로우

1. **DTO 종류 결정**
   - Request DTO: `Create*Dto`, `Update*Dto` 네이밍
   - Response DTO: `*ResponseDto` 또는 `*Dto` (controller 반환 타입)

2. **class-validator 데코레이터 적용**
   - 필수 필드: `@IsString()`, `@IsNumber()`, `@IsUUID()`, `@IsEnum(Enum)`
   - 선택 필드: `@IsOptional()` 먼저 선언 후 타입 데코레이터
   - 배열: `@IsArray()` + `@ArrayNotEmpty()` + `@IsString({ each: true })`

3. **중첩 객체/배열** — `class-transformer` 사용
   - `@Type(() => NestedDto)` 로 변환 활성화
   - `@ValidateNested()` + `@Type()` 조합 필수

4. **Response DTO** — Prisma 모델 전체 반환 금지
   - 노출할 필드만 선언
   - `class-transformer`의 `@Exclude()` 활용 가능

## 체크리스트

- [ ] 필수 필드에 적절한 class-validator 데코레이터
- [ ] 선택 필드에 `@IsOptional()` 선행 선언
- [ ] 중첩 객체는 `@ValidateNested()` + `@Type()`
- [ ] Response DTO에 민감 정보(password 등) 미포함
- [ ] Enum 필드는 `@IsEnum(EnumType)`
- [ ] main.ts에 `useGlobalPipes(new ValidationPipe({ transform: true }))` 확인

## 패턴 참조

→ `references/patterns.md`
