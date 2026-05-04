import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PipelineModule } from './pipeline/pipeline.module';

@Module({
  imports: [
    // ConfigModule: .env 파일을 읽어서 process.env에 로드. isGlobal이라 어디서나 ConfigService 주입 가능
    ConfigModule.forRoot({ isGlobal: true }),

    // BullMQ Redis 연결 설정. forRootAsync는 ConfigService가 초기화된 후 실행되도록 비동기로 처리
    // inject: DI 컨테이너에서 가져올 의존성 목록
    // useFactory: inject에서 가져온 값을 인자로 받아 설정 객체를 반환하는 함수
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          // config.get<타입>(키, 기본값): .env에서 값을 읽고 없으면 기본값 사용
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    // @Global()이라 import 한 번으로 앱 전체에서 PrismaService 주입 가능
    PrismaModule,
    PipelineModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
