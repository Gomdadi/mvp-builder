# NestJS DTO Validation 테스트 패턴

## 1. 기본 DTO 테스트 골격

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateFeatureDto, Status } from './create-feature.dto';

describe('CreateFeatureDto', () => {
  const validData = {
    name: 'Test Feature',
    status: Status.ACTIVE,
    userId: '550e8400-e29b-41d4-a716-446655440000',
  };

  it('유효한 입력은 에러 없이 통과한다', async () => {
    const dto = plainToInstance(CreateFeatureDto, validData);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('name이 없으면 validation 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateFeatureDto, { ...validData, name: undefined });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('status가 enum 범위를 벗어나면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateFeatureDto, { ...validData, status: 'INVALID' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('선택 필드(description)가 없어도 통과한다', async () => {
    const dto = plainToInstance(CreateFeatureDto, { ...validData, description: undefined });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('userId가 UUID 형식이 아니면 에러가 발생한다', async () => {
    const dto = plainToInstance(CreateFeatureDto, { ...validData, userId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'userId')).toBe(true);
  });
});
```

---

## 2. 중첩 DTO 검증 테스트

```ts
import { CreateUserDto } from './create-user.dto';

it('address.city가 없으면 중첩 에러가 발생한다', async () => {
  const dto = plainToInstance(CreateUserDto, {
    name: 'Alice',
    address: { street: '123 Main St' }, // city 누락
  });
  const errors = await validate(dto);
  expect(errors.some((e) => e.property === 'address')).toBe(true);
});
```

---

## 3. 에러 메시지 특정 검증

```ts
it('name이 MaxLength를 초과하면 에러가 발생한다', async () => {
  const dto = plainToInstance(CreateFeatureDto, {
    ...validData,
    name: 'a'.repeat(101),
  });
  const errors = await validate(dto);
  const nameError = errors.find((e) => e.property === 'name');
  expect(nameError).toBeDefined();
  expect(Object.keys(nameError!.constraints!)).toContain('maxLength');
});
```

---

## 주의사항

- `new CreateFeatureDto()` 후 필드 직접 할당 방식은 decorator가 적용되지 않음
- 반드시 `plainToInstance(Dto, plainObject)` 사용
- `transform: true` 가 없으면 `@Type()` 중첩 변환 안 됨 → 테스트 환경에서도 `plainToInstance` 사용으로 해결 가능
