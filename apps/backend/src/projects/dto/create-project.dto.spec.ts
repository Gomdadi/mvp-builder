import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateProjectDto } from './create-project.dto';

// CreateProjectDto의 class-validator 제약 조건 검증.
// plainToInstance로 plain object를 DTO 인스턴스로 변환한 뒤 validate()로 에러를 수집한다.
describe('CreateProjectDto', () => {
  // 모든 필드가 올바른 타입/길이면 에러가 없어야 한다
  it('유효한 입력이면 에러가 없다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '내 프로젝트',
      requirements: '회원가입과 로그인 기능이 필요합니다',
      techStack: { backend: 'nestjs' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  // name 누락 — @IsString/@MinLength 위반으로 name 필드 에러
  it('name이 누락되면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      requirements: '회원가입과 로그인 기능이 필요합니다',
      techStack: { backend: 'nestjs' },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  // name 빈 문자열 — @MinLength(1) 위반
  it('name이 빈 문자열이면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '',
      requirements: '회원가입과 로그인 기능이 필요합니다',
      techStack: { backend: 'nestjs' },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  // name 201자 — @MaxLength(200) 위반
  it('name이 201자이면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'a'.repeat(201),
      requirements: '회원가입과 로그인 기능이 필요합니다',
      techStack: { backend: 'nestjs' },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  // requirements 9자 — @MinLength(10) 위반
  it('requirements가 9자이면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '내 프로젝트',
      requirements: 'a'.repeat(9),
      techStack: { backend: 'nestjs' },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'requirements')).toBe(true);
  });

  // requirements 10001자 — @MaxLength(10000) 위반
  it('requirements가 10001자이면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '내 프로젝트',
      requirements: 'a'.repeat(10001),
      techStack: { backend: 'nestjs' },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'requirements')).toBe(true);
  });

  // techStack이 문자열 — @IsObject 위반
  it('techStack이 객체가 아니면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '내 프로젝트',
      requirements: '회원가입과 로그인 기능이 필요합니다',
      techStack: 'nestjs',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'techStack')).toBe(true);
  });

  // techStack 누락 — @IsObject 위반
  it('techStack이 누락되면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: '내 프로젝트',
      requirements: '회원가입과 로그인 기능이 필요합니다',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'techStack')).toBe(true);
  });
});
