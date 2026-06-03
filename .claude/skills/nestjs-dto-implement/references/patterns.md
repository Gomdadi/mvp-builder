# NestJS DTO 구현 패턴

## 1. Create DTO 기본 패턴

```ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class CreateFeatureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(Status)
  status: Status;

  @IsUUID()
  userId: string;
}
```

---

## 2. Update DTO (PartialType 활용)

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateFeatureDto } from './create-feature.dto';

export class UpdateFeatureDto extends PartialType(CreateFeatureDto) {}
```

모든 필드가 optional이 됨 — 별도로 `@IsOptional()` 선언 불필요.

---

## 3. 중첩 객체 DTO

```ts
import { Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';

export class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;
}

export class CreateUserDto {
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  addresses: AddressDto[];
}
```

---

## 4. Response DTO (필요한 필드만 노출)

```ts
export class FeatureResponseDto {
  id: string;
  name: string;
  status: string;
  createdAt: Date;

  constructor(entity: { id: string; name: string; status: string; createdAt: Date }) {
    this.id = entity.id;
    this.name = entity.name;
    this.status = entity.status;
    this.createdAt = entity.createdAt;
  }
}
```

Service에서 사용:
```ts
return new FeatureResponseDto(entity);
```

---

## 5. main.ts ValidationPipe 설정

```ts
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,      // @Type() 변환 활성화
    whitelist: true,      // DTO에 없는 필드 자동 제거
    forbidNonWhitelisted: false,
  }),
);
```
