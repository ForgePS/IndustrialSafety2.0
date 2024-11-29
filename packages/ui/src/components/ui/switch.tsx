// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const switchVariants = cva(
  'focus-visible:ring-primary/50 data-[state=unchecked]:bg-base-300 peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-[0.48]',
  {
    variants: {
      variant: {
        default: 'data-[state=checked]:bg-primary',
        outline: 'data-[state=checked]:border-primary'
      },
      size: {
        sm: 'bs-5 is-9',
        md: 'bs-6 is-12',
        lg: 'bs-8 is-16'
      }
    }
  }
)

export interface SwitchProps
  extends ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {
  indeterminate?: boolean
}

const Switch = forwardRef<ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ variant = 'default', size = 'md', className, ...props }, ref) => (
    <SwitchPrimitives.Root className={cn(switchVariants({ variant, size, className }))} {...props} ref={ref}>
      <SwitchPrimitives.Thumb
        className={cn('bg-card pointer-events-none block rounded-full shadow-sm ring-0 transition-transform', {
          'bs-[14px] is-[14px] data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5':
            size === 'sm',
          'bs-4 is-4 data-[state=checked]:translate-x-[27px] data-[state=unchecked]:translate-x-[3px]': size === 'md',
          'bs-6 is-6 data-[state=checked]:translate-x-[35px] data-[state=unchecked]:translate-x-[3px]': size === 'lg',
          'data-[state=checked]:bg-primary': variant === 'outline'
        })}
      />
    </SwitchPrimitives.Root>
  )
)

Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
