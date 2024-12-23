'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Third-party Imports
import { useWindowScroll } from 'react-use'
import { useAuthContext } from '@repo/auth/AuthProvider'

// Util Imports
import { cn } from '@repo/ui/lib/utils'
import { frontLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

type Props = {
  children: ReactNode
  className?: string
}

const Header = ({ children, className }: Props) => {
  // States
  const [isScrolled, setIsScrolled] = useState(false)

  // Hooks
  const { y } = useWindowScroll()
  const { isImpersonating } = useAuthContext()

  useEffect(() => {
    if (y > 0) {
      setIsScrolled(true)
    } else {
      setIsScrolled(false)
    }
  }, [y])

  return (
    <header
      className={cn(
        frontLayoutClasses.header,
        'is-full min-bs-[--header-height] sticky z-[--header-z-index] flex flex-shrink-0 items-center justify-center text-base transition-[background-color,opacity,backdrop-filter,-webkit-backdrop-filter,box-shadow,inset-block-start] duration-300 ease-in-out',
        { 'bg-card/[0.85] shadow-sm backdrop-blur-[8px]': isScrolled },
        {
          'block-start-0': !isImpersonating,
          'block-start-[54px]': isImpersonating
        },
        className
      )}
    >
      <div
        className={cn(
          frontLayoutClasses.headerContentWrapper,
          'bs-full pli-6 plb-3 is-full mli-auto max-is-[1400px] relative flex'
        )}
      >
        {children}
      </div>
    </header>
  )
}

export default Header
