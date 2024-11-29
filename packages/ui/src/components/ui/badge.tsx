// React Imports
import type { HTMLAttributes } from 'react'

// Third-party Imports
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md transition-colors focus:outline-none focus-visible:outline-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        accent: 'bg-accent text-accent-foreground',
        outline: 'text-foreground outline outline-1',
        tonalPrimary: 'bg-primary/20 text-primary',
        tonalSuccess: 'bg-success/20 text-success',
        dotPrimary: 'bg-primary bs-2 is-2 rounded-full !p-0'
      },
      size: {
        sm: 'plb-0.5 pli-2 text-xs',
        md: 'plb-0.5 pli-3 text-sm',
        lg: 'pli-3.5 plb-[3px] text-base',
        xl: 'plb-1 pli-4 text-lg'
      },
      shape: {
        circle: 'rounded-full'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'lg'
    }
  }
)

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, size, variant, shape, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size, shape }), className)} {...props} />
}

export { Badge, badgeVariants }
