import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import { getAnalysisDocument, confirmPipeline, feedbackPipeline } from '@/lib/api'

export function ReviewPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const docId = searchParams.get('docId')
  const navigate = useNavigate()

  const [feedback, setFeedback] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: doc, isLoading } = useQuery({
    queryKey: ['analysis-document', docId],
    queryFn: () => getAnalysisDocument(docId!),
    enabled: Boolean(docId),
  })

  const handleConfirm = async () => {
    if (!docId) return
    setConfirming(true)
    setError(null)
    try {
      await confirmPipeline(projectId!, docId)
      navigate(`/projects/${projectId}/pipeline`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '확정 요청에 실패했습니다')
    } finally {
      setConfirming(false)
    }
  }

  const handleFeedback = async () => {
    if (!docId || !feedback.trim()) return
    setSendingFeedback(true)
    setError(null)
    try {
      await feedbackPipeline(projectId!, docId, feedback.trim())
      navigate(`/projects/${projectId}/pipeline`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '피드백 전송에 실패했습니다')
    } finally {
      setSendingFeedback(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm font-mono text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            돌아가기
          </button>
          <h1 className="text-xl font-mono font-bold text-foreground">분석 문서 검토</h1>
          {doc && (
            <span className="text-xs font-mono text-text-muted">v{doc.version}</span>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm font-mono text-text-muted">문서 로딩 중...</p>
          </div>
        )}

        {doc && (
          <div className="space-y-6">
            {/* 탭 */}
            <div className="bg-surface border border-border-subtle rounded-lg overflow-hidden">
              <Tabs defaultValue="erd">
                <div className="px-4 pt-4">
                  <TabsList>
                    <TabsTrigger value="erd">ERD</TabsTrigger>
                    <TabsTrigger value="api">API 스펙</TabsTrigger>
                    <TabsTrigger value="arch">아키텍처</TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6">
                  <TabsContent value="erd">
                    <MarkdownViewer content={doc.erd} className="max-h-[500px] overflow-y-auto" />
                  </TabsContent>
                  <TabsContent value="api">
                    <MarkdownViewer content={doc.apiSpec} className="max-h-[500px] overflow-y-auto" />
                  </TabsContent>
                  <TabsContent value="arch">
                    <MarkdownViewer content={doc.architecture} className="max-h-[500px] overflow-y-auto" />
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            {/* 피드백 */}
            <div className="bg-surface border border-border-subtle rounded-lg p-5 space-y-3">
              <label className="text-sm font-mono text-foreground" htmlFor="feedback">
                수정 요청 (선택사항)
              </label>
              <p className="text-xs text-text-muted">
                분석 내용을 수정하고 싶은 부분이 있다면 입력하세요. 재분석 시 반영됩니다.
              </p>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="예: subscription 테이블에 plan_type 컬럼을 추가해주세요. 결제 기능은 MVP에서 제외해주세요."
                rows={4}
              />
            </div>

            {error && (
              <p className="text-xs font-mono text-red-400 border border-red-900 rounded px-3 py-2 bg-red-950/30">
                ✗ {error}
              </p>
            )}

            {/* 버튼 */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleFeedback}
                loading={sendingFeedback}
                disabled={!feedback.trim() || confirming}
              >
                <RotateCcw className="h-4 w-4" />
                수정 요청 후 재분석
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirm}
                loading={confirming}
                disabled={sendingFeedback}
              >
                이대로 확정
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
