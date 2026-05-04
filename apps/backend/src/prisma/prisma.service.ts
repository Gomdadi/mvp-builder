import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// PrismaClient를 상속해서 NestJS DI 시스템이 관리할 수 있도록 감쌈
// extends PrismaClient: PrismaService가 곧 PrismaClient — prisma.user.findUnique() 등 바로 사용 가능
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // OnModuleInit: NestJS 인터페이스. onModuleInit()을 구현하면 모듈 초기화 시 자동 호출
  async onModuleInit() {
    // 서버 시작 시 DB 연결을 맺음. 이후 쿼리는 이 연결을 재사용
    await this.$connect();
  }
}
