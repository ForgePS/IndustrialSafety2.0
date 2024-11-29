// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const avatarVariants = cva('relative flex shrink-0 overflow-hidden', {
  variants: {
    shape: {
      circle: 'rounded-full',
      rounded: 'rounded-md'
    },
    size: {
      xs: 'bs-6 is-6',
      sm: 'bs-7 is-7',
      md: 'bs-8 is-8',
      lg: 'bs-9 is-9',
      xl: 'bs-10 is-10',
      '2xl': 'bs-11 is-11',
      '3xl': 'bs-12 is-12'
    },
    color: {
      default: 'bg-neutral text-white',
      primary: 'bg-primary/20 text-primary',
      secondary: 'bg-secondary/20 text-secondary',
      destructive: 'bg-destructive/20 text-destructive'
    }
  },
  defaultVariants: {
    shape: 'rounded',
    size: 'xl',
    color: 'default'
  }
})

export interface AvatarProps
  extends Omit<ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>, 'color'>,
    VariantProps<typeof avatarVariants> {}

const Avatar = forwardRef<ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ shape, size, color, className, ...props }, ref) => (
    <AvatarPrimitive.Root ref={ref} className={cn(avatarVariants({ shape, size, color, className }))} {...props} />
  )
)

Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn('bs-full is-full aspect-square', className)} {...props} />
))

AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn('bs-full is-full flex items-center justify-center', className)}
    {...props}
  />
))

AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
