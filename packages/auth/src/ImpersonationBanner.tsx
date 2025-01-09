'use client'

// Third-party Imports
import { TbAlertCircle } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { cn } from '@repo/ui/lib/utils'

// Hook Imports
import { useAuthContext } from './AuthProvider'

export function ImpersonationBanner() {
  // Hooks
  const { isImpersonating, impersonatedUser, stopImpersonation } = useAuthContext()

  return (
    <div
      className={cn(
        'bg-foreground pli-6 plb-3 sticky z-[100] flex items-center justify-between gap-6 text-white transition-[margin,inset-block-start] duration-300 ease-in-out',
        {
          '-mbs-[54px] -block-start-[54px]': !isImpersonating,
          'block-start-0': isImpersonating
        }
      )}
    >
      <div className='flex items-center space-x-3'>
        <TbAlertCircle className='h-5 w-5' />
        <p className='text-sm'>
          You are currently impersonating <span className='font-medium underline'>{impersonatedUser?.email}</span>
        </p>
      </div>
      <Button size='sm' variant='solidDestructive' onClick={() => stopImpersonation()}>
        Exit Impersonation
      </Button>
    </div>
  )
}
