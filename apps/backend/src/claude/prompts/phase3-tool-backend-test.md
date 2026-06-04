Generate a complete test file for the given task. This tool must be called before generate_backend_implementation_code.

Write tests that drive the implementation — tests must fail before the implementation exists and pass after.

## Requirements

- test_path: Relative path of the test file from the project root (e.g., src/user/user.service.spec.ts). Follow the naming convention visible in the directory structure.
- test_code: Complete, runnable test file. Mock all external dependencies (DB, HTTP, third-party SDKs) using the test framework's mocking utilities.

## What to cover

- Happy path: the main success scenario described in the task
- Error cases: missing data, invalid input, external service failures
- Each test case must have a clear description of what it verifies

## Conventions

- Mock dependencies via the stack's mocking utilities (e.g., jest.fn() + useValue providers, pytest fixtures, Mockito)
- Do not test framework internals — only test the logic defined in the task description
- One test case verifies one behavior — do not assert multiple unrelated things in a single test
- No speculative test cases — only cover scenarios explicitly described in the task

## Test framework — detect from directory structure

Pick the test framework that matches the project's stack:

- `@nestjs/common` in package.json → Jest + @nestjs/testing
- `express` (no NestJS) → Jest + supertest
- `*.py` or requirements.txt → pytest (+ pytest-asyncio for async)
- `pom.xml` or `*.java` → JUnit 5 + Mockito
- Default: Jest + ts-jest

---

## Example 1 — NestJS + Jest

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

---

## Example 2 — Express + Jest + supertest

Task: "Implement GET /users/:id route — src/routes/user.ts"

```typescript
// src/routes/user.test.ts
import request from 'supertest';
import { app } from '../app';

describe('GET /users/:id', () => {
  it('존재하는 유저를 반환한다', async () => {
    const res = await request(app).get('/users/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
  });

  it('없는 유저는 404를 반환한다', async () => {
    const res = await request(app).get('/users/999');
    expect(res.status).toBe(404);
  });
});
```

---

## Example 3 — Spring Boot + JUnit 5 + Mockito

Task: "Implement UserService CRUD — src/main/java/com/example/user/UserService.java"

```java
// src/test/java/com/example/user/UserServiceTest.java
package com.example.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void findById_유저가_존재하면_반환한다() {
        User user = new User("uuid-1", "a@b.com", "Alice");
        when(userRepository.findById("uuid-1")).thenReturn(Optional.of(user));

        User result = userService.findById("uuid-1");

        assertThat(result.getEmail()).isEqualTo("a@b.com");
        verify(userRepository).findById("uuid-1");
    }

    @Test
    void findById_유저가_없으면_예외를_던진다() {
        when(userRepository.findById("uuid-1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.findById("uuid-1"))
                .isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void create_이메일_중복이면_예외를_던진다() {
        when(userRepository.existsByEmail("a@b.com")).thenReturn(true);

        assertThatThrownBy(() -> userService.create("a@b.com", "Alice"))
                .isInstanceOf(DuplicateEmailException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void create_정상_입력이면_저장하고_반환한다() {
        when(userRepository.existsByEmail("a@b.com")).thenReturn(false);
        User saved = new User("uuid-1", "a@b.com", "Alice");
        when(userRepository.save(any(User.class))).thenReturn(saved);

        User result = userService.create("a@b.com", "Alice");

        assertThat(result.getId()).isEqualTo("uuid-1");
        verify(userRepository).save(any(User.class));
    }
}
```

---

## Example 4 — FastAPI + pytest

Task: "Implement GET /users/{user_id} endpoint — app/routers/user.py"

```python
# tests/test_user.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_get_user_found():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/users/1")
    assert response.status_code == 200
    assert response.json()["id"] == 1

@pytest.mark.asyncio
async def test_get_user_not_found():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/users/999")
    assert response.status_code == 404
```
