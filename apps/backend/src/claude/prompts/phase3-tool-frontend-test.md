Generate a complete test file for the given UI component task. This tool must be called before generate_frontend_implementation_code.

Write tests that drive the implementation — tests must fail before the component exists and pass after.

## Requirements

- test_path: Relative path of the test file from the project root (e.g., src/components/LoginForm.test.tsx). Follow the naming convention visible in the directory structure.
- test_code: Complete, runnable test file. Test the component's behavior and logic — not its visual styling.

## What to cover

- Rendering: the component renders the expected elements (inputs, buttons, labels)
- Interaction: user events (typing, clicking, submitting) produce the expected behavior
- Callbacks: props such as `onSubmit`/`onChange` are invoked with the expected arguments
- Do not assert on colors, spacing, or other purely visual styling — those are not testable here

## Conventions

- Mock dependencies via the test framework's utilities (e.g., vi.fn(), jest.fn())
- One test case verifies one behavior — do not assert multiple unrelated things in a single test
- No speculative test cases — only cover scenarios explicitly described in the task

## Test framework — detect from directory structure

Pick the test framework that matches the project's stack:

- `vite.config.ts` + `.tsx` → Vitest + @testing-library/react
- `vite.config.ts` + `.vue` → Vitest + @vue/test-utils
- `next.config.js` or `pages/` directory → Jest + @testing-library/react

---

## Example 1 — React + Vitest

Task: "Implement LoginForm — src/components/LoginForm.tsx"

```typescript
// src/components/LoginForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('이메일과 비밀번호 입력 필드를 렌더링한다', () => {
    render(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('제출 시 입력한 값으로 onSubmit을 호출한다', () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
  });

  it('이메일이 비어 있으면 onSubmit을 호출하지 않는다', () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

---

## Example 2 — Vue 3 + Vitest

Task: "Implement UserCard — src/components/UserCard.vue"

```typescript
// src/components/UserCard.test.ts
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import UserCard from './UserCard.vue';

describe('UserCard', () => {
  it('전달받은 유저 이름을 렌더링한다', () => {
    const wrapper = mount(UserCard, { props: { name: 'Alice' } });
    expect(wrapper.text()).toContain('Alice');
  });

  it('버튼 클릭 시 select 이벤트를 emit한다', async () => {
    const wrapper = mount(UserCard, { props: { name: 'Alice', id: 1 } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[1]]);
  });
});
```

---

## Example 3 — Next.js + Jest

Task: "Implement NavBar — src/components/NavBar.tsx"

```typescript
// src/components/NavBar.test.tsx
import { render, screen } from '@testing-library/react';
import NavBar from './NavBar';

describe('NavBar', () => {
  it('전달받은 링크를 모두 렌더링한다', () => {
    render(<NavBar links={[{ label: 'Home', href: '/' }, { label: 'About', href: '/about' }]} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('각 링크가 올바른 href를 가진다', () => {
    render(<NavBar links={[{ label: 'Home', href: '/' }]} />);
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
  });
});
```
