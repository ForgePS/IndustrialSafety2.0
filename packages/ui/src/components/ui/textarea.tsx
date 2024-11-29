// React Imports
import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'is-full min-bs-16 border-input bg-card pli-4 plb-2 text-textSecondary placeholder:text-textDisabled focus-visible:outline-primary focus-visible:shadow-primarySm disabled:bg-neutral/10 flex rounded-md border text-base outline-2 -outline-offset-1 focus-visible:outline-none focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:border-transparent',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})

Textarea.displayName = 'Textarea'

export { Textarea }
