import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessionStore } from '@/store/session'

interface ProtectedRouteProps {
  children: ReactNode
}

// 세션이 없으면 랜딩 페이지로 리다이렉트
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { sessionId } = useSessionStore()

  if (!sessionId) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
