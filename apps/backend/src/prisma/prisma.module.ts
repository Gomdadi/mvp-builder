import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global(): AppModule에 한 번만 import하면 다른 모듈에서 imports 선언 없이 PrismaService 주입 가능
@Global()
@Module({
  // providers: NestJS DI가 인스턴스를 생성하고 관리할 클래스 목록
  providers: [PrismaService],
  // exports: 이 모듈 외부에서 주입받을 수 있도록 공개. 없으면 이 모듈 안에서만 사용 가능
  exports: [PrismaService],
})
export class PrismaModule {}
