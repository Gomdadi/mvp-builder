import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';
import { S3_BUCKET, S3_CLIENT } from './s3.constants';

@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3Client({
          region: config.get<string>('AWS_REGION', 'ap-northeast-2'),
          // AWS_ENDPOINT가 있으면 LocalStack으로 연결 (로컬 개발용)
          ...(config.get<string>('AWS_ENDPOINT') && {
            endpoint: config.get<string>('AWS_ENDPOINT'),
            forcePathStyle: true,
          }),
        }),
    },
    {
      provide: S3_BUCKET,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.getOrThrow<string>('S3_BUCKET'),
    },
    S3Service,
  ],
  exports: [S3Service],
})
export class S3Module {}
