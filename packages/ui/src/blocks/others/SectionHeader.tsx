// React Imports
import type { ReactNode } from 'react'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type Props = {
  title: ReactNode
  subtitle?: ReactNode
  className?: string
  titleClassName?: string
  subtitleClassName?: string
}

const SectionHeader = (props: Props) => {
  // Props
  const { title, subtitle, className, titleClassName, subtitleClassName } = props

  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      <h1 className={cn('text-2xl font-semibold sm:text-3xl', titleClassName)}>{title}</h1>
      {subtitle && <p className={cn('text-textDisabled text-lg sm:text-xl', subtitleClassName)}>{subtitle}</p>}
    </div>
  )
}

export default SectionHeader
