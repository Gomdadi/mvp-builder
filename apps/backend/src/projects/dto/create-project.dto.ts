import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

// POST /v1/projects 요청 body 검증 DTO.
// ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })가 전역 적용되어
// 여기 선언되지 않은 필드가 들어오면 요청이 거부된다.
export class CreateProjectDto {
  // 프로젝트 이름 — 1~200자 문자열. Project.name 컬럼(length: 200)에 대응
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  // 사용자 요구사항 — Phase 1 분석의 입력. 최소 10자 이상이어야 의미 있는 분석 가능
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  requirements!: string;

  // 기술 스택 — JSON 객체. Project.techStack(jsonb)에 그대로 저장됨
  @IsObject()
  techStack!: Record<string, unknown>;
}
