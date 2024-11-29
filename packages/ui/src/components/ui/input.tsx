// React Imports
import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

// Third-party Imports
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const inputVariants = cva(
  'is-full border-input bg-card text-textSecondary placeholder:text-textDisabled focus-visible:outline-primary focus-visible:shadow-primarySm disabled:bg-neutral/10 flex rounded-md border file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:border-transparent',
  {
    variants: {
      size: {
        sm: 'bs-[30px] pli-2.5 plb-1 text-sm',
        md: 'bs-[38px] pli-3 plb-2 text-base',
        lg: 'bs-[46px] pli-4 plb-[11px] text-lg'
      }
    },
    defaultVariants: {
      size: 'md'
    }
  }
)

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

const Input = forwardRef<HTMLInputElement, InputProps>(({ size, className, type, ...props }, ref) => {
  return <input type={type} className={cn(inputVariants({ size, className }))} ref={ref} {...props} />
})

Input.displayName = 'Input'

export { Input }
