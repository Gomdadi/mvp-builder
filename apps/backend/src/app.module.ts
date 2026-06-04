import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { PipelineModule } from './pipeline/pipeline.module';
import { SessionModule } from './session/session.module';
import { GithubModule } from './github/github.module';
import { SseModule } from './sse/sse.module';
import { ProjectsModule } from './projects/projects.module';
import { Project } from './entities/project.entity';
import { AnalysisDocument } from './entities/analysis-document.entity';
import { PipelineRun } from './entities/pipeline-run.entity';
import { Task } from './entities/task.entity';

@Module({
  imports: [
    // ConfigModule: .env 파일을 읽어서 process.env에 로드. isGlobal이라 어디서나 ConfigService 주입 가능
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeOrmModule.forRootAsync: ConfigService가 초기화된 후 DB 연결 설정을 구성
    // forRootAsync는 앱 전역 DB 연결 1개를 설정. 각 기능 모듈은 forFeature()로 엔티티를 등록
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // DATABASE_URL: postgresql://user:pass@host:port/dbname 형태의 연결 문자열
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [Project, AnalysisDocument, PipelineRun, Task],
        // synchronize: true — 엔티티 변경 시 DB 스키마 자동 동기화 (개발 환경 전용)
        synchronize: true,
      }),
    }),

    // BullMQ Redis 연결 설정. forRootAsync는 ConfigService가 초기화된 후 실행되도록 비동기로 처리
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    PipelineModule,
    SessionModule, // POST /v1/session — GitHub PAT + Claude API Key를 Redis에 임시 저장
    GithubModule, // Phase 4 완료 후 생성 코드를 GitHub repo에 push
    SseModule, // GET /v1/pipeline/:projectId/stream — 파이프라인 진행 상황 SSE 실시간 스트리밍
    ProjectsModule, // 프로젝트 CRUD + 분석 문서/태스크/생성 파일 조회 API
  ],
  controllers: [AppController],
})
export class AppModule {}
