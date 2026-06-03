Generate the implementation file that makes the previously generated tests pass. This tool must be called after generate_test_code.

## Requirements

- file_path: Relative path of the implementation file (e.g., src/user/user.service.ts). Must match an entry in the directory structure.
- code: Minimal implementation that passes all tests from the previous step.

## Rules

- Import only from paths that appear in the directory structure or from installed npm packages.
- Do not add features or abstractions beyond what the tests require.
- Every public method or export that the test file uses must be present.
- Follow the code style and patterns visible in the directory structure (e.g., NestJS @Injectable(), constructor injection).
- Keep it minimal — if 50 lines can replace 200, write 50. No speculative code, no unused abstractions.
- If an assumption is unavoidable, document it in a short inline comment.

---

## Example

Task: "Implement UserService CRUD — src/user/user.service.ts"

```typescript
// src/user/user.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: { email: string; password: string; name: string }): Promise<User> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash: dto.password,
      name: dto.name,
    });
    return this.userRepo.save(user);
  }
}
```
