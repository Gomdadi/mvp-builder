Generate a complete UI component file that makes the previously generated tests pass. This tool must be called after generate_frontend_test_code. Apply the design system provided in the context.

## Requirements

- file_path: Relative path of the component file from the project root (e.g., src/components/LoginForm.tsx). Must match an entry in the directory structure.
- code: Complete, runnable component file. Include all imports, props, and logic described in the task.

## Rules

- Implement exactly the behavior the tests assert — every prop, callback, and element the test file references must be present.
- Use colors, typography, and effects exactly as specified in the design system.
- Import only from paths that appear in the directory structure or from installed packages.
- Do not add features or abstractions beyond what the tests and task description require.

## Stack — detect from directory structure

Match the framework of the existing files:

- `vite.config.ts` + `.tsx` → React + TypeScript
- `vite.config.ts` + `.vue` → Vue 3 (`<script setup>`)
- `next.config.js` or `pages/` directory → Next.js

---

## Example 1 — React + TypeScript

Task: "Implement LoginForm — src/components/LoginForm.tsx"

```typescript
// src/components/LoginForm.tsx
import { useState, FormEvent } from 'react';

interface LoginFormProps {
  onSubmit: (values: { email: string; password: string }) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return; // 이메일이 비어 있으면 제출하지 않음
    onSubmit({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}
```

---

## Example 2 — Vue 3 (`<script setup>`)

Task: "Implement UserCard — src/components/UserCard.vue"

```vue
<!-- src/components/UserCard.vue -->
<script setup lang="ts">
const props = defineProps<{ name: string; id: number }>();
const emit = defineEmits<{ (e: 'select', id: number): void }>();
</script>

<template>
  <div class="user-card">
    <span>{{ props.name }}</span>
    <button @click="emit('select', props.id)">Select</button>
  </div>
</template>
```

---

## Example 3 — Next.js

Task: "Implement NavBar — src/components/NavBar.tsx"

```typescript
// src/components/NavBar.tsx
import Link from 'next/link';

interface NavLink {
  label: string;
  href: string;
}

export default function NavBar({ links }: { links: NavLink[] }) {
  return (
    <nav>
      {links.map((link) => (
        <Link key={link.href} href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```
