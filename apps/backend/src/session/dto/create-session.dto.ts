import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

// POST /v1/session 요청 body 검증용 DTO.
// 인증이 없는 구조이므로 GitHub PAT와 Claude API Key를 요청마다 받아 Redis 세션에 임시 저장한다.
export class CreateSessionDto {
  // githubToken: GitHub Personal Access Token. Phase 4 완료 후 repo 생성 + 코드 push에 사용
  @IsString()
  @IsNotEmpty()
  githubToken!: string;

  // claudeApiKey: 파이프라인 각 Phase에서 Claude API 호출 시 사용할 키 (env 기본키 대신 세션 키 우선)
  @IsString()
  @IsNotEmpty()
  claudeApiKey!: string;

  // isPrivate: 생성할 GitHub repo의 공개 여부. true면 private, false면 public
  @IsBoolean()
  isPrivate!: boolean;
}
