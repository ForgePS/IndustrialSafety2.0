// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import clsx from 'clsx'

// Component Imports
import Content from '@repo/ui/layouts/components/front/Content'

// Util Imports
import { frontLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

type FrontLayoutProps = {
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
}

const FrontLayout = (props: FrontLayoutProps) => {
  // Props
  const { header, footer, children } = props

  return (
    <div className={clsx(frontLayoutClasses.root, 'min-is-0 is-full bs-full flex flex-col')}>
      {header ?? null}
      {/* Content */}
      <Content>{children}</Content>
      {footer ?? null}
    </div>
  )
}

export default FrontLayout
