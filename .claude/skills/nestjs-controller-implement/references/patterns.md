# NestJS Controller 구현 패턴

## 1. REST Controller 기본 골격

```ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FeatureService } from './feature.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';

@Controller('features')
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Get()
  findAll(@Query('userId') userId: string) {
    return this.featureService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.featureService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFeatureDto) {
    return this.featureService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeatureDto) {
    return this.featureService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.featureService.remove(id);
  }
}
```

---

## 2. 비동기 처리 엔드포인트 (202 Accepted)

큐에 job을 넣고 즉시 응답하는 패턴:

```ts
@Post(':id/start')
@HttpCode(HttpStatus.ACCEPTED)
start(@Param('id') id: string) {
  return this.featureService.start(id);
}
```

---

## 3. 중첩 라우팅 (sub-resource)

```ts
@Controller('users/:userId/posts')
export class UserPostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  findAll(@Param('userId') userId: string) {
    return this.postService.findAllByUser(userId);
  }

  @Post()
  create(@Param('userId') userId: string, @Body() dto: CreatePostDto) {
    return this.postService.create({ ...dto, userId });
  }
}
```

---

## 4. ValidationPipe 설정 위치

전역 설정 (main.ts — 이 경우 Controller에 별도 선언 불필요):
```ts
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
```

특정 엔드포인트만 적용:
```ts
@Post()
@UsePipes(new ValidationPipe({ transform: true }))
create(@Body() dto: CreateFeatureDto) { ... }
```
