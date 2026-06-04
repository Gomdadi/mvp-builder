import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionStore {
  sessionId: string | null
  setSessionId: (id: string) => void
  clearSession: () => void
}

// sessionId를 localStorage에 지속 저장하는 Zustand 스토어
export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      sessionId: null,
      setSessionId: (id) => set({ sessionId: id }),
      clearSession: () => set({ sessionId: null }),
    }),
    { name: 'mvp_session' },
  ),
)
