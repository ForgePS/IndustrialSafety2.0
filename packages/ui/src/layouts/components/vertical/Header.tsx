// React Imports
import type { ReactNode } from 'react'

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

  return (
    <header
      className={cn(
        verticalLayoutClasses.header,
        'is-full block-start-0 bg-background/[0.85] min-bs-[--header-height] border-be sticky z-[--header-z-index] flex flex-shrink-0 items-center justify-center backdrop-blur-[8px]',
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
