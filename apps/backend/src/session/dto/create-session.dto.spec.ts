import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSessionDto } from './create-session.dto';

// CreateSessionDto의 class-validator 제약 조건 검증.
// plainToInstance로 plain object를 DTO 인스턴스로 변환한 뒤 validate()로 에러를 수집한다.
describe('CreateSessionDto', () => {
  // 유효한 입력 — 모든 필드가 올바른 타입이면 에러가 없어야 한다
  it('유효한 입력이면 에러가 없다', async () => {
    const dto = plainToInstance(CreateSessionDto, {
      githubToken: 'ghp_xxx',
      claudeApiKey: 'sk-ant-xxx',
      isPrivate: false,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  // githubToken 누락 — @IsNotEmpty 위반으로 해당 필드 에러가 있어야 한다
  it('githubToken이 비어있으면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateSessionDto, {
      githubToken: '',
      claudeApiKey: 'sk-ant-xxx',
      isPrivate: false,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'githubToken')).toBe(true);
  });

  // claudeApiKey 누락 — @IsNotEmpty 위반
  it('claudeApiKey가 누락되면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateSessionDto, {
      githubToken: 'ghp_xxx',
      isPrivate: false,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'claudeApiKey')).toBe(true);
  });

  // isPrivate 타입 불일치 — boolean이 아닌 값이면 @IsBoolean 위반
  it('isPrivate가 boolean이 아니면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateSessionDto, {
      githubToken: 'ghp_xxx',
      claudeApiKey: 'sk-ant-xxx',
      isPrivate: 'yes',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isPrivate')).toBe(true);
  });
});
