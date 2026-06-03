Generate a complete test file for the given task. This tool must be called before generate_implementation_code.

Write tests that drive the implementation — tests must fail before the implementation exists and pass after.

## Requirements

- test_path: Relative path of the test file from the project root (e.g., src/user/user.service.spec.ts). Follow the naming convention visible in the directory structure.
- test_code: Complete, runnable test file. Mock all external dependencies (DB, HTTP, third-party SDKs) using Jest mocks.

## What to cover

- Happy path: the main success scenario described in the task
- Error cases: missing data, invalid input, external service failures
- Each test case must have a clear description of what it verifies

## Conventions

- Use Jest + NestJS Testing utilities (@nestjs/testing)
- Mock dependencies via jest.fn() and useValue providers
- Do not test framework internals — only test the logic defined in the task description
- One test case verifies one behavior — do not assert multiple unrelated things in a single it()
- No speculative test cases — only cover scenarios explicitly described in the task

---

## Example

Task: "Implement UserService CRUD — src/user/user.service.ts"

```typescript
// src/user/user.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';

const mockUserRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();
    service = module.get(UserService);
  });

  describe('findById', () => {
    it('유저가 존재하면 반환한다', async () => {
      const user = { id: 'uuid-1', email: 'a@b.com', name: 'Alice' };
      mockUserRepo.findOne.mockResolvedValue(user);

      const result = await service.findById('uuid-1');

      expect(result).toEqual(user);
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('유저가 없으면 NotFoundException을 던진다', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('uuid-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('이메일이 중복되면 ConflictException을 던진다', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'uuid-1' });

      await expect(service.create({ email: 'a@b.com', password: 'pw', name: 'Alice' }))
        .rejects.toThrow(ConflictException);
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('정상 입력이면 유저를 생성하고 반환한다', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const created = { id: 'uuid-1', email: 'a@b.com', name: 'Alice' };
      mockUserRepo.create.mockReturnValue(created);
      mockUserRepo.save.mockResolvedValue(created);

      const result = await service.create({ email: 'a@b.com', password: 'pw', name: 'Alice' });

      expect(result).toEqual(created);
      expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
```
