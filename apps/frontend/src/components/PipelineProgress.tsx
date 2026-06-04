import { CheckCircle, Circle, Loader } from 'lucide-react'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import type { PipelinePhase } from '@/types/api'

type PhaseState = 'waiting' | 'running' | 'done'

interface PipelineProgressProps {
  currentPhase: PipelinePhase | null
  completedPhases: Set<PipelinePhase>
}

const phases: { id: PipelinePhase; label: string }[] = [
  { id: 'PHASE_1', label: 'Phase 1\n분석' },
  { id: 'PHASE_2', label: 'Phase 2\n태스크' },
  { id: 'PHASE_3', label: 'Phase 3\n코드 생성' },
  { id: 'PHASE_4', label: 'Phase 4\nGitHub' },
]

export function PipelineProgress({ currentPhase, completedPhases }: PipelineProgressProps) {
  function getState(phaseId: PipelinePhase): PhaseState {
    if (completedPhases.has(phaseId)) return 'done'
    if (currentPhase === phaseId) return 'running'
    return 'waiting'
  }

  return (
    // items-start: 아이콘+텍스트 블록이 상단 기준으로 정렬되어 연결선 위치를 맞추기 쉬움
    <div className="flex items-start justify-center w-full gap-0">
      {phases.map((phase, i) => {
        const state = getState(phase.id)
        return (
          <Fragment key={phase.id}>
            {/* 스텝: 아이콘 + 텍스트 세로 중앙 정렬 */}
            <div className="flex flex-col items-center gap-2 min-w-0">
              <div
                className={cn(
                  'flex items-center justify-center rounded-full w-12 h-12 border-2 transition-all duration-300 shrink-0',
                  state === 'done' && 'border-accent-green bg-accent-green/10',
                  state === 'running' && 'border-accent-green',
                  state === 'waiting' && 'border-border-subtle',
                )}
              >
                {state === 'done' && <CheckCircle className="w-6 h-6 text-accent-green" />}
                {state === 'running' && <Loader className="w-6 h-6 text-accent-green animate-spin" />}
                {state === 'waiting' && <Circle className="w-6 h-6 text-border-subtle" />}
              </div>
              <span
                className={cn(
                  'text-sm font-mono text-center whitespace-pre-line leading-tight',
                  state === 'done' && 'text-accent-green',
                  state === 'running' && 'text-foreground',
                  state === 'waiting' && 'text-text-muted',
                )}
              >
                {phase.label}
              </span>
            </div>

            {/* 연결선: mt-6 = 아이콘(w-12/h-12) 절반 높이 */}
            {i < phases.length - 1 && (
              <div
                className={cn(
                  'h-px w-12 shrink-0 mt-6 transition-colors duration-300',
                  completedPhases.has(phase.id) ? 'bg-accent-green' : 'bg-border-subtle',
                )}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
