// React Imports
import type { ReactNode } from 'react'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '@repo/ui/blocks/styles.module.css'

type Props = {
  children: ReactNode
  className?: string
  id?: string
  sectionClassName?: string
}

const SectionWrapper = (props: Props) => {
  // Props
  const { children, className, id, sectionClassName } = props

  return (
    <section id={id} className={cn('overflow-hidden', sectionClassName)}>
      <div className={cn(frontCommonStyles.layoutSpacing, className)}>{children}</div>
    </section>
  )
}

export default SectionWrapper
