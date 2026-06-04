import { create } from 'zustand'

type Theme = 'dark' | 'light'

const THEME_KEY = 'mvp_theme'

function getInitialTheme(): Theme {
  // index.html 인라인 스크립트와 동일한 키를 사용하므로 항상 동기적으로 읽힘
  return (localStorage.getItem(THEME_KEY) as Theme) ?? 'dark'
}

interface ThemeStore {
  theme: Theme
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  theme: getInitialTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    set({ theme: next })
    localStorage.setItem(THEME_KEY, next)
    // html 요소의 'dark' 클래스를 토글 — Tailwind darkMode: ['class'] 동작
    document.documentElement.classList.toggle('dark', next === 'dark')
  },
}))
