import { Link, useLocation } from 'react-router-dom'
import { Terminal, Sun, Moon } from 'lucide-react'
import { useSessionStore } from '@/store/session'
import { useThemeStore } from '@/store/theme'
import { Button } from '@/components/ui/button'

export function Header() {
  const { sessionId, clearSession } = useSessionStore()
  const { theme, toggleTheme } = useThemeStore()
  const location = useLocation()

  if (location.pathname === '/') return null

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          to={sessionId ? '/projects/new' : '/'}
          className="flex items-center gap-2 text-foreground hover:text-accent-green transition-colors cursor-pointer"
        >
          <Terminal className="h-5 w-5 text-accent-green" />
          <span className="font-mono font-semibold text-sm">MVP Builder</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* 다크/라이트 토글 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {sessionId && (
            <>
              <Link to="/projects/new">
                <Button variant="outline" size="sm">
                  + 새 프로젝트
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSession}
                className="text-text-muted hover:text-red-400"
              >
                세션 종료
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
