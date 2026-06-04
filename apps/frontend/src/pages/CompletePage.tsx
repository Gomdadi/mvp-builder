import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Copy, ExternalLink, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/CodeBlock'
import { FileTree } from '@/components/FileTree'
import { getProject, getProjectFiles, getFileContent } from '@/lib/api'

export function CompletePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: Boolean(projectId),
  })

  const { data: fileTree } = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () => getProjectFiles(projectId!),
    enabled: Boolean(projectId),
  })

  const { data: fileContent, isLoading: fileLoading } = useQuery({
    queryKey: ['file-content', projectId, selectedFile],
    queryFn: () => getFileContent(projectId!, selectedFile!),
    enabled: Boolean(projectId) && Boolean(selectedFile),
  })

  const githubUrl = project?.githubRepoUrl ?? ''
  const repoName = project?.githubRepoName ?? project?.name ?? 'my-project'

  const cloneCommand = githubUrl
    ? `git clone ${githubUrl}\ncd ${repoName}\ndocker compose up --build`
    : ''

  const handleCopyUrl = async () => {
    if (!githubUrl) return
    try {
      await navigator.clipboard.writeText(githubUrl)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } catch {
      // 무시
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* 완료 헤더 */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 border-2 border-accent-green rounded-full mb-4">
            <Check className="h-8 w-8 text-accent-green" />
          </div>
          <h1 className="text-3xl font-mono font-bold text-foreground mb-2">MVP 생성 완료!</h1>
          <p className="text-text-muted">GitHub 저장소가 생성되었습니다. docker compose up --build 한 줄로 실행하세요.</p>
        </div>

        {/* GitHub 저장소 섹션 */}
        <div className="max-w-2xl mx-auto mb-12 space-y-4">
          {/* URL 표시 */}
          {githubUrl && (
            <div className="flex items-center gap-2 p-3 bg-surface border border-border-subtle rounded-md">
              <span className="text-xs font-mono text-text-muted shrink-0">repo</span>
              <span className="flex-1 text-sm font-mono text-accent-green truncate">{githubUrl}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1 text-xs font-mono text-text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  {copiedUrl ? (
                    <><Check className="h-3.5 w-3.5 text-accent-green" /><span className="text-accent-green">복사됨</span></>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" />복사</>
                  )}
                </button>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-mono text-text-muted hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  GitHub에서 보기
                </a>
              </div>
            </div>
          )}

          {/* 실행 가이드 */}
          {cloneCommand && (
            <div className="space-y-1.5">
              <p className="text-xs font-mono text-text-muted">시작하는 방법:</p>
              <CodeBlock code={cloneCommand} language="bash" />
            </div>
          )}

          {/* 새 프로젝트 버튼 */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/projects/new')}
          >
            <Plus className="h-4 w-4" />
            새 프로젝트 만들기
          </Button>
        </div>

        {/* 생성된 파일 브라우저 */}
        {fileTree && fileTree.length > 0 && (
          <div>
            <h2 className="text-sm font-mono font-semibold text-foreground mb-4">생성된 파일 구조</h2>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* 파일 트리 */}
              <div className="lg:col-span-2 bg-surface border border-border-subtle rounded-md">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <span className="text-xs font-mono text-text-muted">파일 탐색기</span>
                </div>
                <FileTree
                  nodes={fileTree}
                  selectedPath={selectedFile}
                  onSelectFile={setSelectedFile}
                  className="h-[500px]"
                />
              </div>

              {/* 파일 내용 뷰어 */}
              <div className="lg:col-span-3 bg-surface border border-border-subtle rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
                  <span className="text-xs font-mono text-text-muted truncate">
                    {selectedFile ?? '파일을 선택하세요'}
                  </span>
                </div>
                <div className="h-[500px] overflow-auto">
                  {fileLoading && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs font-mono text-text-muted">로딩 중...</p>
                    </div>
                  )}
                  {!selectedFile && !fileLoading && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs font-mono text-text-muted">좌측에서 파일을 선택하세요</p>
                    </div>
                  )}
                  {fileContent && !fileLoading && (
                    <pre className="p-4 text-xs font-mono text-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap">
                      {fileContent.content}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
