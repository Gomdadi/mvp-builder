---
name: nestjs-module-implement
description: "NestJS Module 파일(*.module.ts)을 작성하고 app.module.ts에 등록한다. DI 설정, BullMQ 큐 등록, @Global 적용, exports 설정이 필요할 때 사용한다. 키워드: module 구현, @Module, imports exports providers, BullMQ registerQueue, @Global"
---

# NestJS Module 구현

## 트리거
- `*.module.ts` 신규 작성
- 모듈에 새 서비스/컨트롤러/워커 등록
- BullMQ 큐 등록, 글로벌 모듈 설정

## 구현 워크플로우

1. **모듈 구성 요소 파악**
   - `imports`: 이 모듈이 사용하는 외부 모듈 (BullMQ, 다른 feature 모듈 등)
   - `controllers`: HTTP 핸들러
   - `providers`: 서비스, 워커, 커스텀 프로바이더
   - `exports`: 다른 모듈에서 inject해야 하는 서비스만 포함

2. **BullMQ 큐 등록** — Worker가 있는 모듈에 추가
   ```ts
   BullModule.registerQueue({ name: QUEUE_NAME })
   ```

3. **@Global() 사용 기준** — 앱 전체에서 공통으로 쓰이는 단일 인프라 서비스만
   - 예: PrismaModule, S3Module
   - feature 모듈에는 사용하지 않음

4. **app.module.ts 등록** — 새 모듈 생성 후 반드시 `AppModule.imports`에 추가

## 체크리스트

- [ ] `@Module()` 데코레이터 선언
- [ ] 외부에 노출할 서비스만 `exports`에 포함
- [ ] BullMQ 사용 모듈은 `BullModule.registerQueue()` 추가
- [ ] `@Global()` 은 인프라 모듈에만 사용
- [ ] `app.module.ts`의 `imports`에 신규 모듈 추가

## 패턴 참조

→ `references/patterns.md`
