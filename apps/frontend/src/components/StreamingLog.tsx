import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { SseEvent } from '@/types/api'

interface LogLine {
  text: string
  type: 'info' | 'success' | 'task' | 'error' | 'dim'
  timestamp: string
}

function eventToLogLine(event: SseEvent): LogLine {
  const timestamp = new Date(event.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  switch (event.type) {
    case 'phase_started':
      return {
        text: `▶ Phase ${event.phase?.replace('PHASE_', '')} 시작`,
        type: 'info',
        timestamp,
      }
    case 'phase_completed':
      return {
        text: `✓ Phase ${event.phase?.replace('PHASE_', '')} 완료`,
        type: 'success',
        timestamp,
      }
    case 'task_started':
      return { text: `  → ${event.taskName ?? event.taskId} 생성 중...`, type: 'task', timestamp }
    case 'task_completed':
      return { text: `  ✓ ${event.taskName ?? event.taskId} 완료`, type: 'success', timestamp }
    case 'pipeline_completed':
      return { text: '✓ 파이프라인 완료 — GitHub 업로드 중...', type: 'success', timestamp }
    case 'pipeline_failed':
      return { text: `✗ 오류: ${event.message ?? '알 수 없는 오류'}`, type: 'error', timestamp }
    default:
      return { text: JSON.stringify(event), type: 'dim', timestamp }
  }
}

interface StreamingLogProps {
  events: SseEvent[]
  connected: boolean
  className?: string
}

export function StreamingLog({ events, connected, className }: StreamingLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const lines = events.map(eventToLogLine)

  return (
    <div
      className={cn(
        'bg-surface dark:bg-black border border-border-subtle rounded-md p-4 overflow-y-auto font-mono text-xs',
        className,
      )}
    >
      {/* SSE 연결 상태 — 항상 최상단에 고정 표시 */}
      <div className="flex gap-3 leading-5 mb-2 pb-2 border-b border-border-subtle/30">
        <span className="text-text-muted shrink-0">sys</span>
        <span className={cn(connected ? 'text-accent-green' : 'text-text-muted')}>
          {connected ? '● SSE 연결됨' : '○ 연결 대기 중...'}
        </span>
      </div>

      {/* 이벤트 로그 */}
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3 leading-5">
          <span className="text-text-muted shrink-0">{line.timestamp}</span>
          <span
            className={cn(
              line.type === 'success' && 'text-accent-green',
              line.type === 'error' && 'text-red-400',
              line.type === 'info' && 'text-blue-400',
              line.type === 'task' && 'text-foreground',
              line.type === 'dim' && 'text-text-muted',
            )}
          >
            {line.text}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
