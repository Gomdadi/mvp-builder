---
name: nestjs-controller-implement
description: "NestJS Controller 파일(*.controller.ts)을 작성한다. HTTP 엔드포인트 정의, 라우팅, 요청 파라미터 추출, DTO 연동이 필요할 때 사용한다. 키워드: controller 구현, HTTP 엔드포인트, @Get @Post @Param @Body, REST API"
---

# NestJS Controller 구현

## 트리거
- `*.controller.ts` 신규 작성
- 기존 컨트롤러에 엔드포인트 추가
- HTTP 라우팅/상태코드/DTO 연동 작업

## 구현 워크플로우

1. **라우팅 설계** — prefix와 HTTP 메서드/경로 결정
   - `@Controller('resource')` prefix 설정
   - RESTful 경로 패턴: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`

2. **메서드 구현** — 각 핸들러는 서비스 위임만
   - `@Param()`: URL 경로 파라미터
   - `@Body()`: 요청 body (DTO 타입 사용)
   - `@Query()`: 쿼리 스트링
   - Controller에 비즈니스 로직 작성 금지

3. **HTTP 상태코드** — 기본값(200) 아닌 경우 명시
   - `@HttpCode(HttpStatus.ACCEPTED)`: 202 비동기 처리
   - `@HttpCode(HttpStatus.CREATED)`: 201 생성 (POST는 보통 자동)
   - `@HttpCode(HttpStatus.NO_CONTENT)`: 204 삭제

4. **Validation** — `ValidationPipe`로 DTO 검증
   - `main.ts`에 전역 설정된 경우 별도 선언 불필요
   - 특정 엔드포인트만 적용: `@UsePipes(new ValidationPipe())`

## 체크리스트

- [ ] `@Controller('prefix')` 선언
- [ ] 각 핸들러 데코레이터 (`@Get`, `@Post`, `@Patch`, `@Delete`) + 경로
- [ ] 기본값(200) 아닌 상태코드는 `@HttpCode()` 명시
- [ ] `@Param('id')` 등 파라미터 타입 명시
- [ ] Body는 DTO 타입으로 받음
- [ ] 비즈니스 로직 없이 서비스 메서드만 호출

## 패턴 참조

→ `references/patterns.md`
