# NestJS Module 구현 패턴

## 1. 기본 Feature Module

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';
import { FeatureWorker } from './feature.worker';
import { FEATURE_QUEUE } from './feature.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: FEATURE_QUEUE }),
  ],
  controllers: [FeatureController],
  providers: [FeatureService, FeatureWorker],
  exports: [FeatureService],  // 다른 모듈에서 inject할 경우만 exports
})
export class FeatureModule {}
```

---

## 2. Worker 없는 단순 Module

```ts
@Module({
  controllers: [FeatureController],
  providers: [FeatureService],
})
export class FeatureModule {}
```

---

## 3. Global Module (인프라 모듈 전용)

앱 전체에서 import 없이 inject 가능하게 하는 패턴. PrismaModule, S3Module 같은 인프라 레이어에만 사용:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

---

## 4. app.module.ts 등록

신규 모듈 생성 후 반드시 AppModule.imports에 추가:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { FeatureModule } from './feature/feature.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: { host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT },
    }),
    PrismaModule,
    FeatureModule,  // ← 여기에 추가
  ],
})
export class AppModule {}
```

---

## 5. 다른 Feature 모듈 서비스 사용

A 모듈에서 B 모듈의 서비스를 inject해야 할 때:

```ts
// b.module.ts — BService를 exports에 포함
@Module({
  providers: [BService],
  exports: [BService],
})
export class BModule {}

// a.module.ts — BModule을 imports에 포함
@Module({
  imports: [BModule],
  providers: [AService],
})
export class AModule {}
```
