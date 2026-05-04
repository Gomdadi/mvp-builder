import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // NestJS 앱 인스턴스 생성. AppModule이 루트 모듈로 전체 모듈 트리의 시작점
  const app = await NestFactory.create(AppModule);

  // 모든 라우트에 /v1 prefix 적용. 컨트롤러에서는 v1을 생략하고 작성
  app.setGlobalPrefix('v1');

  // 전역 ValidationPipe: 모든 엔드포인트에 자동으로 요청 데이터 검증 적용
  // whitelist: DTO에 없는 필드는 자동으로 제거
  // forbidNonWhitelisted: DTO에 없는 필드가 오면 400 에러 반환
  // transform: 요청 데이터를 DTO 클래스 인스턴스로 자동 변환 (string → number 등)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS: 다른 도메인(프론트엔드)에서 이 API를 호출할 수 있도록 허용
  app.enableCors();

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
