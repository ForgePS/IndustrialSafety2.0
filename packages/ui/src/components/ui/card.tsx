// React Imports
import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'

// Third-party Imports
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const cardVariants = cva('rounded-lg', {
  variants: {
    variant: {
      default: 'bg-card text-textPrimary shadow',
      outlinePrimary: 'border-primary !text-primary border bg-transparent',
      solidPrimary: 'bg-primary text-white shadow',
      tonalPrimary: 'bg-primary/20 text-primary'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = forwardRef<HTMLDivElement, CardProps>(({ className, variant, ...props }, ref) => (
  <div className={cn(cardVariants({ variant }), className)} ref={ref} {...props} />
))

Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn('flex flex-col p-6', className)} ref={ref} {...props} />
))

CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h3 className={cn('text-2xl font-semibold', className)} ref={ref} {...props} />
)

CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p className={cn('text-base text-inherit', className)} ref={ref} {...props} />
)

CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn('pbs-0 p-6 text-base text-inherit', className)} ref={ref} {...props} />
))

CardContent.displayName = 'CardContent'

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn('pbs-0 flex items-center p-6', className)} ref={ref} {...props} />
))

CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
