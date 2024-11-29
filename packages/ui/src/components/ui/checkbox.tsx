// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { TbCheck, TbMinus } from 'react-icons/tb'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const checkboxVariants = cva(
  'border-input focus-visible:ring-primary/50 disabled:!bg-neutral/30 data-[state=checked]:border-primary data-[state=checked]:bg-primary peer shrink-0 rounded-md border focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:!border-0 disabled:!shadow-none data-[state=checked]:text-white data-[state=checked]:shadow-sm',
  {
    variants: {
      size: {
        sm: 'bs-5 is-5',
        md: 'bs-6 is-6',
        lg: 'bs-8 is-8'
      }
    }
  }
)

export interface CheckboxProps
  extends ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  indeterminate?: boolean
}

const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ indeterminate, size = 'md', className, ...props }, ref) => {
    const Icon = indeterminate ? TbMinus : TbCheck

    return (
      <CheckboxPrimitive.Root
        ref={ref}
        checked={indeterminate}
        className={cn(checkboxVariants({ size, className }))}
        {...props}
      >
        <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center')}>
          <Icon className={cn({ 'text-base': size === 'sm', 'text-xl': size === 'md', 'text-2xl': size === 'lg' })} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    )
  }
)

Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
