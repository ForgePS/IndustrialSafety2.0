'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { useAuthContext } from '@repo/auth/AuthProvider'

// Util Imports
import { cn } from '@repo/ui/lib/utils'
import { verticalLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

type Props = {
  children: ReactNode
  className?: string
}

const Header = (props: Props) => {
  // Props
  const { children, className } = props

  // Hooks
  const { isImpersonating } = useAuthContext()

  return (
    <header
      className={cn(
        verticalLayoutClasses.header,
        'is-full bg-background/[0.85] min-bs-[--header-height] border-be sticky z-[--header-z-index] flex flex-shrink-0 items-center justify-center backdrop-blur-[8px] transition-[inset-block-start] duration-300 ease-in-out',
        {
          'block-start-0': !isImpersonating,
          'block-start-[54px]': isImpersonating
        },
        className
      )}
    >
      <div
        className={cn(
          verticalLayoutClasses.headerContentWrapper,
          'bs-full plb-[10px] pli-6 is-full mli-auto max-is-[1400px] relative flex'
        )}
      >
        {children}
      </div>
    </header>
  )
}

export default Header
