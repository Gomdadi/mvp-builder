import { Inject, Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3_BUCKET, S3_CLIENT } from './s3.constants';

// S3 키 패턴의 단일 진실 공급원.
// Phase 3 업로드와 T-E9-01 다운로드 모두 이 함수를 통해 키를 생성 — 패턴 변경 시 여기만 수정
const generatedKey = (projectId: string, filePath: string): string =>
  `generated/${projectId}/${filePath}`;

@Injectable()
export class S3Service {
  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_BUCKET) private readonly bucket: string,
  ) {}

  // Phase 3에서 생성된 코드를 S3에 저장
  async uploadGeneratedFile(projectId: string, filePath: string, code: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: generatedKey(projectId, filePath),
        Body: code,
        ContentType: 'text/plain',
      }),
    );
  }

  // T-E9-01 GitHubService에서 S3 코드를 읽어 GitHub에 push할 때 사용
  async downloadGeneratedFile(projectId: string, filePath: string): Promise<string> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: generatedKey(projectId, filePath),
      }),
    );
    // transformToString: AWS SDK v3의 Body(SdkStream) → string 변환 메서드
    return response.Body!.transformToString();
  }
}
