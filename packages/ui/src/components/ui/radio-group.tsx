// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const radioGroupItemVariants = cva(
  'border-input bg-card focus-visible:ring-primary/50 disabled:!bg-neutral/30 data-[state=checked]:border-primary peer aspect-square rounded-full border focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:!border-0 disabled:!shadow-none data-[state=checked]:shadow-sm',
  {
    variants: {
      size: {
        sm: 'bs-5 is-5 data-[state=checked]:border-[5px]',
        md: 'bs-6 is-6 data-[state=checked]:border-[5px]',
        lg: 'bs-8 is-8 data-[state=checked]:border-[7px]'
      }
    }
  }
)

export interface RadioGroupItemProps
  extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioGroupItemVariants> {}

const RadioGroup = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />
})

RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = forwardRef<ElementRef<typeof RadioGroupPrimitive.Item>, RadioGroupItemProps>(
  ({ size = 'md', className, ...props }, ref) => {
    return <RadioGroupPrimitive.Item ref={ref} className={cn(radioGroupItemVariants({ size, className }))} {...props} />
  }
)

RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
