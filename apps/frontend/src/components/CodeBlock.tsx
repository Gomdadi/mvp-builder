import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API 실패 시 무시
    }
  }

  return (
    <div
      className={cn(
        'relative bg-surface dark:bg-black border border-border-subtle rounded-md overflow-hidden',
        className,
      )}
    >
      {language && (
        <div className="px-4 py-1.5 border-b border-border-subtle bg-surface flex items-center justify-between">
          <span className="text-xs font-mono text-text-muted">{language}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-accent-green" />
                <span className="text-accent-green">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                복사
              </>
            )}
          </button>
        </div>
      )}

      <div className="relative">
        {!language && (
          <button
            onClick={handleCopy}
            className="absolute right-3 top-3 flex items-center gap-1 text-xs font-mono text-text-muted hover:text-foreground transition-colors cursor-pointer z-10"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent-green" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <pre className="p-4 overflow-x-auto text-xs font-mono text-foreground leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}
