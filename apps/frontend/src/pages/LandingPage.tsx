import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, GitBranch, Moon, Sparkles, Sun, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionModal } from '@/components/SessionModal'
import { useSessionStore } from '@/store/session'
import { useThemeStore } from '@/store/theme'

export function LandingPage() {
  const navigate = useNavigate()
  const { sessionId } = useSessionStore()
  const { theme, toggleTheme } = useThemeStore()
  const [modalOpen, setModalOpen] = useState(false)

  // 세션이 있으면 바로 프로젝트 생성으로 이동
  useEffect(() => {
    if (sessionId) {
      navigate('/projects/new')
    }
  }, [sessionId, navigate])

  const handleSessionSuccess = () => {
    setModalOpen(false)
    navigate('/projects/new')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-accent-green" />
          <span className="font-mono font-semibold text-sm text-foreground">MVP Builder</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            시작하기
          </Button>
        </div>
      </header>

      {/* 히어로 */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-3xl w-full">
          {/* 레이블 */}
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-accent-green/30 rounded-full text-xs font-mono text-accent-green mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            AI 기반 자동화 MVP 생성기
          </div>

          {/* 타이틀 */}
          <h1 className="text-4xl md:text-6xl font-mono font-bold text-foreground leading-tight tracking-tight mb-6">
            <span className="text-accent-green">MVP Builder</span>
          </h1>

          <p className="text-base md:text-lg text-text-muted max-w-xl mx-auto leading-relaxed mb-10">
            요구사항을 자연어로 입력하면 ERD, API 스펙, 아키텍처를 자동 생성하고
            테스트를 통과하는 코드를 GitHub에 자동으로 올려드립니다.
          </p>

          {/* CTA */}
          <Button size="lg" onClick={() => setModalOpen(true)} className="gap-2 font-mono">
            시작하기
            <ArrowRight className="h-4 w-4" />
          </Button>

          {/* 3단계 플로우 */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {[
              {
                icon: <Sparkles className="h-5 w-5 text-accent-green" />,
                step: '01',
                title: '요구사항 자연어 입력',
                desc: '만들고 싶은 서비스를 자연어로 자유롭게 설명하세요',
              },
              {
                icon: <Terminal className="h-5 w-5 text-accent-green" />,
                step: '02',
                title: '문서 자동 생성 및 확인',
                desc: 'ERD, API 스펙, 아키텍처를 AI가 설계하고 피드백을 반영합니다',
              },
              {
                icon: <GitBranch className="h-5 w-5 text-accent-green" />,
                step: '03',
                title: 'GitHub 자동 전달',
                desc: 'docker compose up --build 한 줄로 실행되는 코드가 내 저장소에',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-5 border border-border-subtle rounded-lg bg-surface hover:border-accent-green/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  {item.icon}
                  <span className="text-xs font-mono text-text-muted">{item.step}</span>
                </div>
                <h3 className="text-sm font-mono font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-xs text-text-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* 가치 제안 */}
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs font-mono text-text-muted">
            {['비용 투명성', '코드 소유권', 'Docker 실행 보장', 'BYOK (Bring Your Own Key)', 'Sandbox Testing & Validation Loop'].map((v) => (
              <span key={v} className="flex items-center gap-1.5">
                <span className="text-accent-green">✓</span>
                {v}
              </span>
            ))}
          </div>
        </div>
      </main>

      <SessionModal
        open={modalOpen}
        onSuccess={handleSessionSuccess}
        onClose={() => setModalOpen(false)}
      />
    </div>
  )
}
