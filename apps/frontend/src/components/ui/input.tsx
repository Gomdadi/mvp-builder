import * as React from 'react'
import { cn } from '@/lib/utils'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-10 px-3 bg-surface border border-border-subtle rounded-md text-sm text-foreground font-mono',
        'placeholder:text-text-muted',
        'focus:outline-none focus:border-accent-green focus:ring-1 focus:ring-accent-green',
        'transition-colors duration-200',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
