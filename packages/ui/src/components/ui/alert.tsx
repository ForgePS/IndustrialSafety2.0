// React Imports
import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'

// Third-party Imports
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Utils Imports
import { cn } from '@repo/ui/lib/utils'

const alertVariants = cva(
  'is-full [&>svg~*]:pis-9 [&>svg]:inline-start-4 [&>svg]:block-start-4 relative rounded-lg p-4 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:text-inherit',
  {
    variants: {
      variant: {
        default: 'bg-neutral text-white',
        outline: 'border-foreground text-foreground border',
        destructive: 'border-destructive text-destructive border',
        primary: 'border-primary text-primary border',
        success: 'border-success text-success border',
        tonalDestructive: 'bg-destructive/20 text-destructive',
        tonalSuccess: 'bg-success/20 text-success'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

const Alert = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role='alert' className={cn(alertVariants({ variant }), className)} {...props} />
  )
)

Alert.displayName = 'Alert'

const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h5 ref={ref} className={cn('mbe-1 text-lg font-semibold', className)} {...props} />
)

AlertTitle.displayName = 'AlertTitle'

const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('text-base opacity-80', className)} {...props} />
)

AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription }
