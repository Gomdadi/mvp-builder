import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/store/theme'

const MERMAID_THEMES = {
  dark: {
    theme: 'dark' as const,
    themeVariables: {
      background: '#0A0A0A',
      primaryColor: '#1A1A1A',
      primaryTextColor: '#E5E5E5',
      lineColor: '#22C55E',
      edgeLabelBackground: '#111111',
    },
  },
  light: {
    theme: 'default' as const,
    themeVariables: {
      background: '#FAFAFA',
      primaryColor: '#F4F4F5',
      primaryTextColor: '#0A0A0A',
      lineColor: '#16A34A',
      edgeLabelBackground: '#FAFAFA',
    },
  },
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { theme } = useThemeStore()

  useEffect(() => {
    if (!ref.current) return

    // 테마가 바뀔 때마다 mermaid 재초기화 후 다시 렌더링
    mermaid.initialize({ startOnLoad: false, ...MERMAID_THEMES[theme] })

    const render = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
        const { svg } = await mermaid.render(id, code)
        if (ref.current) ref.current.innerHTML = svg
      } catch (err) {
        if (ref.current) {
          ref.current.innerHTML = `<pre class="text-red-400 text-xs">${String(err)}</pre>`
        }
      }
    }

    void render()
  }, [code, theme])

  return <div ref={ref} className="my-4 overflow-x-auto" />
}

interface MarkdownViewerProps {
  content: string
  className?: string
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div
      className={cn(
        // dark:prose-invert — html.dark 클래스 유무에 따라 자동 전환
        'prose dark:prose-invert prose-sm max-w-none',
        'prose-headings:font-mono prose-headings:text-foreground',
        'prose-p:text-foreground/80 prose-p:leading-relaxed',
        'prose-code:text-accent-green prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-xs',
        'prose-pre:bg-surface prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-md',
        'prose-table:text-sm prose-th:text-accent-green prose-th:font-mono',
        'prose-a:text-accent-purple prose-a:no-underline hover:prose-a:underline',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClass, children, ...props }) {
            const lang = /language-(\w+)/.exec(codeClass ?? '')?.[1]
            const code = String(children).trim()

            if (lang === 'mermaid') return <MermaidBlock code={code} />

            if (!codeClass) {
              return <code className={codeClass} {...props}>{children}</code>
            }

            return (
              <pre className="overflow-x-auto">
                <code className={cn('text-xs', codeClass)}>{children}</code>
              </pre>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
