import * as React from 'react'
import { cn } from '@/lib/utils'

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-3 py-2 bg-surface border border-border-subtle rounded-md text-sm text-foreground font-sans',
        'placeholder:text-text-muted resize-none',
        'focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green',
        'transition-colors duration-200',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
