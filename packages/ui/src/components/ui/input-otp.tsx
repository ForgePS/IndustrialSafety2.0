'use client'

// React Imports
import { forwardRef, useContext } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import { OTPInput, OTPInputContext } from 'input-otp'
import { TbPointFilled } from 'react-icons/tb'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const InputOTP = forwardRef<ElementRef<typeof OTPInput>, ComponentPropsWithoutRef<typeof OTPInput>>(
  ({ className, containerClassName, ...props }, ref) => (
    <OTPInput
      ref={ref}
      containerClassName={cn('flex items-center gap-2 has-[:disabled]:opacity-40', containerClassName)}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
)

InputOTP.displayName = 'InputOTP'

const InputOTPGroup = forwardRef<ElementRef<'div'>, ComponentPropsWithoutRef<'div'>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center justify-between gap-4', className)} {...props} />
))

InputOTPGroup.displayName = 'InputOTPGroup'

const InputOTPSlot = forwardRef<ElementRef<'div'>, ComponentPropsWithoutRef<'div'> & { index: number }>(
  ({ index, className, ...props }, ref) => {
    const inputOTPContext = useContext(OTPInputContext)
    const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index]

    return (
      <div
        ref={ref}
        className={cn(
          'bs-8 is-8 md:bs-[46px] md:is-[46px] border-input relative flex flex-wrap items-center justify-center rounded-md border first:border-l',
          isActive && 'outline-primary z-10 outline-none -outline-offset-1',
          className
        )}
        {...props}
      >
        {char}
        {hasFakeCaret && (
          <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
            <div className='bs-4 is-px animate-caret-blink bg-foreground duration-1000' />
          </div>
        )}
      </div>
    )
  }
)

InputOTPSlot.displayName = 'InputOTPSlot'

const InputOTPSeparator = forwardRef<ElementRef<'div'>, ComponentPropsWithoutRef<'div'>>(({ ...props }, ref) => (
  <div ref={ref} role='separator' {...props}>
    <TbPointFilled />
  </div>
))

InputOTPSeparator.displayName = 'InputOTPSeparator'

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
