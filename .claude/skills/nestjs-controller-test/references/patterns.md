# NestJS Controller Unit Test 패턴

## 1. Controller unit test 기본 골격

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('FeatureController', () => {
  let controller: FeatureController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeatureController],
      providers: [{ provide: FeatureService, useValue: mockService }],
    }).compile();

    controller = module.get<FeatureController>(FeatureController);
  });

  describe('findAll', () => {
    it('service.findAll을 호출하고 결과를 반환한다', async () => {
      const mockResult = [{ id: '1', name: 'Test' }];
      mockService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll('user-1');

      expect(mockService.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockResult);
    });
  });

  describe('create', () => {
    it('service.create를 올바른 인자로 호출한다', async () => {
      const dto = { name: 'New Feature', userId: 'user-1' };
      const mockResult = { id: 'new-id', ...dto };
      mockService.create.mockResolvedValue(mockResult);

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('remove', () => {
    it('service.remove를 호출한다', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('entity-1');

      expect(mockService.remove).toHaveBeenCalledWith('entity-1');
    });
  });
});
```

---

## 2. 서비스 예외 전파 검증

```ts
  it('service가 예외를 던지면 controller도 전파한다', async () => {
    mockService.findOne.mockRejectedValue(new NotFoundException('NOT_FOUND'));

    await expect(controller.findOne('unknown')).rejects.toThrow(NotFoundException);
  });
```

---

## 3. supertest를 사용한 HTTP 통합 테스트 (e2e 수준)

HTTP 상태코드나 헤더를 검증해야 할 때:

```ts
import * as request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';

let app: INestApplication;

beforeEach(async () => {
  const module = await Test.createTestingModule({
    controllers: [FeatureController],
    providers: [{ provide: FeatureService, useValue: mockService }],
  }).compile();

  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.init();
});

afterEach(() => app.close());

it('POST /features → 201', async () => {
  mockService.create.mockResolvedValue({ id: 'new-id' });

  await request(app.getHttpServer())
    .post('/features')
    .send({ name: 'Test' })
    .expect(201)
    .expect((res) => {
      expect(res.body.id).toBe('new-id');
    });
});
```
