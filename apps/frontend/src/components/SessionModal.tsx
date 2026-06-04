import { useState } from 'react'
import { Eye, EyeOff, Terminal } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createSession } from '@/lib/api'
import { useSessionStore } from '@/store/session'

interface SessionModalProps {
  open: boolean
  onSuccess: () => void
  onClose: () => void
}

export function SessionModal({ open, onSuccess, onClose }: SessionModalProps) {
  const { setSessionId } = useSessionStore()
  const [githubToken, setGithubToken] = useState('')
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [showGithub, setShowGithub] = useState(false)
  const [showClaude, setShowClaude] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!githubToken.trim() || !claudeApiKey.trim()) return

    setLoading(true)
    setError(null)

    try {
      const { sessionId } = await createSession({ githubToken, claudeApiKey, isPrivate })
      setSessionId(sessionId)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 생성에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="h-5 w-5 text-accent-green" />
            <DialogTitle>시작하기</DialogTitle>
          </div>
          <DialogDescription>
            GitHub PAT와 Claude API Key를 입력하면 세션이 생성됩니다.
            <br />
            키는 서버에 저장되지 않으며, 세션 종료 시 삭제됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* GitHub PAT */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-text-muted" htmlFor="github-token">
              GitHub Personal Access Token
            </label>
            <div className="relative">
              <Input
                id="github-token"
                type={showGithub ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowGithub(!showGithub)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-foreground cursor-pointer transition-colors"
              >
                {showGithub ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              repo 권한이 필요합니다.{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-purple hover:underline"
              >
                토큰 발급 →
              </a>
            </p>
          </div>

          {/* Claude API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-text-muted" htmlFor="claude-key">
              Claude API Key
            </label>
            <div className="relative">
              <Input
                id="claude-key"
                type={showClaude ? 'text' : 'password'}
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-api03-xxxx"
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowClaude(!showClaude)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-foreground cursor-pointer transition-colors"
              >
                {showClaude ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Private repo 옵션 */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4 rounded border-border-subtle bg-surface accent-accent-green cursor-pointer"
            />
            <span className="text-sm font-mono text-text-muted group-hover:text-foreground transition-colors">
              Private 저장소로 생성
            </span>
          </label>

          {error && (
            <p className="text-xs font-mono text-red-400 border border-red-900 rounded px-3 py-2 bg-red-950/30">
              ✗ {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1"
              loading={loading}
              disabled={!githubToken.trim() || !claudeApiKey.trim()}
            >
              시작하기 →
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
