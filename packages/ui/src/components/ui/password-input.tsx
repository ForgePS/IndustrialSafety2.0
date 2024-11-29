'use client'

// React Imports
import { forwardRef, useState } from 'react'

// Third-party Imports
import { TbEye, TbEyeOff } from 'react-icons/tb'

// Components Imports
import { Button } from './button'
import { Input } from './input'
import type { InputProps } from './input'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const PasswordInput = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  // States
  const [showPassword, setShowPassword] = useState(false)

  // Vars
  const disabled = props.disabled

  return (
    <div className='is-full relative'>
      <Input
        type={showPassword ? 'text' : 'password'}
        className={cn('hide-password-toggle pie-10', className)}
        ref={ref}
        {...props}
      />
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='absolute end-0 top-0 rounded-full !bg-transparent'
        onClick={() => setShowPassword(prev => !prev)}
        disabled={disabled}
      >
        {showPassword && !disabled ? (
          <TbEyeOff className='text-xl' aria-hidden='true' />
        ) : (
          <TbEye className='text-xl' aria-hidden='true' />
        )}
        <span className='sr-only'>{showPassword ? 'Hide password' : 'Show password'}</span>
      </Button>

      {/* hides browsers password toggles */}
      <style>{`
					.hide-password-toggle::-ms-reveal,
					.hide-password-toggle::-ms-clear {
						visibility: hidden;
						pointer-events: none;
						display: none;
					}
				`}</style>
    </div>
  )
})

PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
