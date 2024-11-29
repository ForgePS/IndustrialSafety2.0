// React Imports
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

// Third-party Imports
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-300 active:scale-[0.98] active:transform disabled:pointer-events-none disabled:opacity-[0.48]',
  {
    variants: {
      variant: {
        default:
          'text-primary-foreground shadow-primaryDefault border-primary from-primary to-primary hover:shadow-primaryMd border-2 bg-gradient-to-r via-[hsl(259,84%,50%)] bg-[200%_auto] hover:bg-[right_center] focus-visible:border-transparent focus-visible:bg-[right_center] focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:outline-[#BAAEFF] active:bg-[right_center]',

        secondary:
          'text-secondary-foreground shadow-secondaryDefault border-secondary from-secondary to-secondary hover:shadow-secondaryMd border-2 bg-gradient-to-r via-[hsl(258,6%,32%)] bg-[200%_auto] hover:bg-[right_center] focus-visible:border-transparent focus-visible:bg-[right_center] focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:outline-[#BBB8C1] active:bg-[right_center]',

        destructive:
          'text-destructive-foreground shadow-destructiveDefault border-destructive from-destructive to-destructive hover:shadow-destructiveMd border-2 bg-gradient-to-r via-[hsl(0,68%,43%)] bg-[200%_auto] hover:bg-[right_center] focus-visible:border-transparent focus-visible:bg-[right_center] focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:outline-[#FCC7B1] active:bg-[right_center]',

        solid:
          'bg-primary text-primary-foreground shadow-primaryDefault hover:shadow-primaryMd hover:bg-primary-focus active:bg-primary-focus focus-visible:bg-primary-focus focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:outline-[#BAAEFF]',

        solidDestructive:
          'bg-destructive text-destructive-foreground shadow-destructiveDefault hover:shadow-destructiveMd hover:bg-destructive-focus active:bg-destructive-focus focus-visible:bg-destructive-focus focus-visible:outline-none focus-visible:outline-offset-0 focus-visible:outline-[#FCC7B1]',

        tonal:
          'bg-primary/20 text-primary hover:bg-primary/30 active:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline-primary/60 focus-visible:outline-none focus-visible:outline-offset-0',

        tonalDefault:
          'bg-neutral/20 text-foreground hover:bg-neutral/30 active:bg-neutral/30 focus-visible:bg-neutral/30 focus-visible:outline-neutral/40 focus-visible:outline-none focus-visible:outline-offset-0',

        outline:
          'border-primary text-primary hover:bg-primary/10 active:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-primary border focus-visible:outline',

        ghost:
          'text-foreground hover:bg-neutral/10 active:bg-neutral/10 focus-visible:bg-neutral/10 focus-visible:outline-accent/100 focus-visible:outline-none focus-visible:outline-offset-0',

        ghostPrimary:
          'text-primary hover:bg-primary/10 active:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-primary/100 focus-visible:outline-none focus-visible:outline-offset-0',

        ghostDestructive:
          'text-destructive hover:bg-destructive/10 active:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-destructive/100 focus-visible:outline-none focus-visible:outline-offset-0'
      },
      size: {
        default: 'text-base',
        sm: 'text-sm',
        lg: 'text-lg',
        xs: 'text-sm',
        icon: 'bs-[38px] is-[38px]'
      },
      shape: {
        square: 'rounded-md',
        rounded: 'rounded-full'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'square'
    }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', shape = 'square', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, shape, className }), {
          'pli-[18px] plb-[9px]':
            (variant === 'default' || variant === 'secondary' || variant === 'destructive' || variant === 'ghost') &&
            size === 'lg',
          'pli-3.5 plb-1.5':
            (variant === 'default' ||
              variant === 'secondary' ||
              variant === 'destructive' ||
              variant === 'ghost' ||
              variant === 'ghostPrimary' ||
              variant === 'ghostDestructive') &&
            size === 'default',
          'pli-2.5 plb-[3px]':
            (variant === 'default' || variant === 'secondary' || variant === 'destructive' || variant === 'ghost') &&
            size === 'sm',
          'pli-1.5 plb-0':
            (variant === 'default' || variant === 'secondary' || variant === 'destructive' || variant === 'ghost') &&
            size === 'xs',
          'pli-5 plb-[11px]':
            (variant === 'solid' || variant === 'tonal' || variant === 'tonalDefault') && size === 'lg',
          'pli-4 plb-2':
            (variant === 'solid' || variant === 'tonal' || variant === 'tonalDefault') && size === 'default',
          'pli-3 plb-[5px]':
            (variant === 'solid' || variant === 'tonal' || variant === 'tonalDefault') && size === 'sm',
          'pli-2 plb-0.5': (variant === 'solid' || variant === 'tonal' || variant === 'tonalDefault') && size === 'xs',
          'pli-[19px] plb-2.5': variant === 'outline' && size === 'lg',
          'pli-[15px] plb-[7px]': variant === 'outline' && size === 'default',
          'pli-[11px] plb-1': variant === 'outline' && size === 'sm',
          'pli-[7px] plb-[1px]': variant === 'outline' && size === 'xs'
        })}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export { Button, buttonVariants }
