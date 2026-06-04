import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { PipelineProgress } from '@/components/PipelineProgress'
import { StreamingLog } from '@/components/StreamingLog'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import { StatusBadge } from '@/components/StatusBadge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useSSE } from '@/lib/sse'
import { getAnalysisDocument, getTasksByPipelineRun, startPipeline } from '@/lib/api'
import type { PipelinePhase, Task } from '@/types/api'

export function PipelinePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { events, connected, reconnectFailed, close } = useSSE(projectId!)

  const [currentPhase, setCurrentPhase] = useState<PipelinePhase | null>(null)
  const [completedPhases, setCompletedPhases] = useState<Set<PipelinePhase>>(new Set())
  const [failed, setFailed] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)

  // Phase 1 완료 시 분석 문서 ID
  const [analysisDocId, setAnalysisDocId] = useState<string | null>(null)
  // Phase 2 완료 시 pipelineRunId
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null)
  // Task 상태 관리 (SSE task_completed 이벤트로 업데이트)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, Task['status']>>({})

  // 자동 이동 타이머 관리
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 이미 처리한 이벤트 인덱스 추적 — 전체 events 재순환 방지
  const processedLengthRef = useRef(0)

  // Phase 1 완료 시 분석 문서 조회
  const { data: analysisDoc } = useQuery({
    queryKey: ['analysis-document', analysisDocId],
    queryFn: () => getAnalysisDocument(analysisDocId!),
    enabled: Boolean(analysisDocId),
  })

  // Phase 2 완료 시 태스크 목록 조회
  const { data: tasks } = useQuery({
    queryKey: ['tasks', pipelineRunId],
    queryFn: () => getTasksByPipelineRun(pipelineRunId!),
    enabled: Boolean(pipelineRunId),
  })

  // SSE 이벤트 처리 — 새로 추가된 이벤트만 처리해 중복 실행 방지
  useEffect(() => {
    const newEvents = events.slice(processedLengthRef.current)
    processedLengthRef.current = events.length

    for (const event of newEvents) {
      if (event.type === 'phase_started' && event.phase) {
        setCurrentPhase(event.phase)
      }

      if (event.type === 'phase_completed' && event.phase) {
        setCompletedPhases((prev) => new Set([...prev, event.phase!]))
        setCurrentPhase(null)

        if (event.phase === 'PHASE_1' && event.analysisDocumentId) {
          setAnalysisDocId(event.analysisDocumentId)
          // 기존 타이머가 있으면 취소 후 재설정 (중복 navigate 방지)
          if (navTimerRef.current) clearTimeout(navTimerRef.current)
          navTimerRef.current = setTimeout(() => {
            close()
            navigate(`/projects/${projectId}/review?docId=${event.analysisDocumentId}`)
          }, 2000)
        }

        if (event.phase === 'PHASE_2' && event.pipelineRunId) {
          setPipelineRunId(event.pipelineRunId)
        }
      }

      if (event.type === 'task_completed' && event.taskId) {
        setTaskStatuses((prev) => ({ ...prev, [event.taskId!]: 'DONE' }))
      }

      if (event.type === 'task_started' && event.taskId) {
        setTaskStatuses((prev) => ({ ...prev, [event.taskId!]: 'IN_PROGRESS' }))
      }

      if (event.type === 'pipeline_completed') {
        close()
        navigate(`/projects/${projectId}/complete`)
      }

      if (event.type === 'pipeline_failed') {
        setFailed(event.message ?? '파이프라인 실행 중 오류가 발생했습니다')
      }
    }
  }, [events, projectId, navigate, close])

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current)
    }
  }, [])

  const handleRestart = async () => {
    setRestarting(true)
    setFailed(null)
    try {
      await startPipeline(projectId!)
      window.location.reload()
    } catch {
      setRestarting(false)
    }
  }

  // 우측 패널 — 현재 Phase에 따라 다른 내용 표시
  function PhaseResultPanel() {
    // Phase 2 완료: 태스크 목록 우선 표시
    if (tasks && tasks.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-mono text-text-muted mb-3">
            태스크 목록 ({tasks.length}개)
          </p>
          <div className="space-y-2 overflow-y-auto max-h-[500px] pr-1">
            {tasks.map((task) => {
              const status = taskStatuses[task.id] ?? task.status
              return (
                <div
                  key={task.id}
                  className="p-3 bg-surface border border-border-subtle rounded-md"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-xs font-mono text-foreground font-medium leading-tight flex-1">
                      #{task.orderIndex} {task.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          task.type === 'BACKEND'
                            ? 'text-blue-400 bg-blue-900/20'
                            : 'text-accent-purple bg-purple-900/20'
                        }`}
                      >
                        {task.type}
                      </span>
                      <StatusBadge status={status} />
                    </div>
                  </div>
                  {task.description && (
                    <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // Phase 1 완료: 분석 문서 미리보기
    if (analysisDoc) {
      return (
        <div>
          <p className="text-xs font-mono text-text-muted mb-3">
            분석 문서 미리보기 — 2초 후 검토 페이지로 이동합니다
          </p>
          <Tabs defaultValue="erd">
            <TabsList>
              <TabsTrigger value="erd">ERD</TabsTrigger>
              <TabsTrigger value="api">API 스펙</TabsTrigger>
              <TabsTrigger value="arch">아키텍처</TabsTrigger>
            </TabsList>
            <TabsContent value="erd">
              <div className="max-h-[400px] overflow-y-auto">
                <MarkdownViewer content={analysisDoc.erd} />
              </div>
            </TabsContent>
            <TabsContent value="api">
              <div className="max-h-[400px] overflow-y-auto">
                <MarkdownViewer content={analysisDoc.apiSpec} />
              </div>
            </TabsContent>
            <TabsContent value="arch">
              <div className="max-h-[400px] overflow-y-auto">
                <MarkdownViewer content={analysisDoc.architecture} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )
    }

    // 대기 중
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-xs font-mono text-text-muted">
          Phase 완료 시 결과가 표시됩니다
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-xl font-mono font-bold text-foreground mb-6">Pipeline Running...</h1>

        {/* Phase 진행 스텝 — 4개 Phase */}
        <div className="mb-8 max-w-2xl mx-auto">
          <PipelineProgress currentPhase={currentPhase} completedPhases={completedPhases} />
        </div>

        {/* SSE 재연결 실패 경고 */}
        {reconnectFailed && !failed && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 border border-yellow-800 bg-yellow-950/30 rounded-md text-sm text-yellow-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>연결이 끊어졌습니다. 페이지를 새로고침하면 진행 상황이 복원됩니다.</span>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto text-xs underline cursor-pointer hover:no-underline"
            >
              새로고침
            </button>
          </div>
        )}

        {/* 에러 배너 */}
        {failed && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 border border-red-800 bg-red-950/30 rounded-md">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400 flex-1">{failed}</p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRestart}
              loading={restarting}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              재시작
            </Button>
          </div>
        )}

        {/* 메인 2컬럼 레이아웃 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 좌측: 터미널 로그 */}
          <div className="space-y-3">
            <p className="text-xs font-mono text-text-muted">실시간 로그</p>
            <StreamingLog events={events} connected={connected} className="h-[500px]" />
          </div>

          {/* 우측: Phase 결과 패널 */}
          <div className="space-y-3">
            <p className="text-xs font-mono text-text-muted">Phase 결과</p>
            <div className="bg-surface border border-border-subtle rounded-md p-4 min-h-[500px]">
              <PhaseResultPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
