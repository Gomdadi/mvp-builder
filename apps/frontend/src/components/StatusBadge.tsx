import { cn } from '@/lib/utils'
import type { ProjectStatus, TaskStatus, PipelineStatus } from '@/types/api'

type AnyStatus = ProjectStatus | TaskStatus | PipelineStatus

const statusConfig: Record<AnyStatus, { label: string; className: string }> = {
  CREATED: { label: 'CREATED', className: 'text-text-muted border-text-muted' },
  ANALYZING: { label: 'ANALYZING', className: 'text-yellow-400 border-yellow-400' },
  AWAITING_REVIEW: { label: 'REVIEW', className: 'text-accent-purple border-accent-purple' },
  GENERATING: { label: 'GENERATING', className: 'text-blue-400 border-blue-400' },
  COMPLETED: { label: 'COMPLETED', className: 'text-accent-green border-accent-green' },
  FAILED: { label: 'FAILED', className: 'text-red-400 border-red-400' },
  RUNNING: { label: 'RUNNING', className: 'text-yellow-400 border-yellow-400' },
  PENDING: { label: 'PENDING', className: 'text-text-muted border-text-muted' },
  IN_PROGRESS: { label: 'IN PROGRESS', className: 'text-blue-400 border-blue-400' },
  DONE: { label: 'DONE', className: 'text-accent-green border-accent-green' },
}

interface StatusBadgeProps {
  status: AnyStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: 'text-text-muted border-text-muted' }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-mono border rounded',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}
