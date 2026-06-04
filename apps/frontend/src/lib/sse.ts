import { useCallback, useEffect, useRef, useState } from 'react'
import type { SseEvent } from '@/types/api'
import { getSessionId } from '@/lib/api'

const MAX_RECONNECTS = 3

// MSW는 EventSource 스트리밍을 제대로 지원하지 않으므로
// MOCK_MODE에서는 EventSource 대신 setInterval로 이벤트를 직접 주입한다
const MOCK_MODE = import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK === 'true'

const MOCK_SSE_EVENTS: Omit<SseEvent, 'timestamp'>[] = [
  { type: 'phase_started', phase: 'PHASE_1' },
  { type: 'phase_completed', phase: 'PHASE_1' },
  { type: 'phase_started', phase: 'PHASE_2' },
  { type: 'phase_completed', phase: 'PHASE_2', pipelineRunId: 'mock-run-id' },
  { type: 'phase_started', phase: 'PHASE_3' },
  { type: 'task_started', taskId: 'task-1', taskName: 'User 엔티티 + UsersService' },
  { type: 'task_completed', taskId: 'task-1', taskName: 'User 엔티티 + UsersService' },
  { type: 'task_started', taskId: 'task-2', taskName: 'Todo 엔티티 + TodosService' },
  { type: 'task_completed', taskId: 'task-2', taskName: 'Todo 엔티티 + TodosService' },
  { type: 'task_started', taskId: 'task-3', taskName: 'AuthModule (JWT)' },
  { type: 'task_completed', taskId: 'task-3', taskName: 'AuthModule (JWT)' },
  { type: 'task_started', taskId: 'task-4', taskName: 'TodosController (REST)' },
  { type: 'task_completed', taskId: 'task-4', taskName: 'TodosController (REST)' },
  { type: 'task_started', taskId: 'task-5', taskName: 'TodoList 컴포넌트' },
  { type: 'task_completed', taskId: 'task-5', taskName: 'TodoList 컴포넌트' },
  { type: 'task_started', taskId: 'task-6', taskName: 'LoginPage + 인증 스토어' },
  { type: 'task_completed', taskId: 'task-6', taskName: 'LoginPage + 인증 스토어' },
  { type: 'phase_completed', phase: 'PHASE_3' },
  { type: 'phase_started', phase: 'PHASE_4' },
  { type: 'pipeline_completed', githubRepoUrl: 'https://github.com/mock-user/todo-app' },
]

interface UseSSEResult {
  events: SseEvent[]
  connected: boolean
  reconnectFailed: boolean
  close: () => void
}

export function useSSE(projectId: string): UseSSEResult {
  const [events, setEvents] = useState<SseEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [reconnectFailed, setReconnectFailed] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const retryCountRef = useRef(0)
  const closedRef = useRef(false)

  // ── MOCK_MODE: setInterval로 이벤트 순차 주입 ────────────────────────────
  useEffect(() => {
    if (!MOCK_MODE) return

    setConnected(true)
    let i = 0
    const timer = setInterval(() => {
      if (i < MOCK_SSE_EVENTS.length) {
        const event: SseEvent = { ...MOCK_SSE_EVENTS[i], timestamp: new Date().toISOString() } as SseEvent
        setEvents((prev) => [...prev, event])
        i++
      } else {
        clearInterval(timer)
      }
    }, 800)

    return () => {
      clearInterval(timer)
      setConnected(false)
    }
  }, [projectId])

  // ── 실제 EventSource 연결 ────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (closedRef.current) return

    const sessionId = getSessionId()
    const url = sessionId
      ? `/v1/pipeline/${projectId}/stream?sessionId=${sessionId}`
      : `/v1/pipeline/${projectId}/stream`

    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      retryCountRef.current = 0
    }

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as SseEvent
        setEvents((prev) => [...prev, event])
      } catch {
        // 파싱 실패는 무시
      }
    }

    es.onerror = () => {
      es.close()
      setConnected(false)

      if (closedRef.current) return

      if (retryCountRef.current < MAX_RECONNECTS) {
        retryCountRef.current += 1
        setTimeout(connect, 2000)
      } else {
        setReconnectFailed(true)
      }
    }
  }, [projectId])

  useEffect(() => {
    if (MOCK_MODE) return

    closedRef.current = false
    connect()

    return () => {
      closedRef.current = true
      esRef.current?.close()
    }
  }, [connect])

  const close = useCallback(() => {
    if (MOCK_MODE) return
    closedRef.current = true
    esRef.current?.close()
    setConnected(false)
  }, [])

  return { events, connected, reconnectFailed, close }
}
