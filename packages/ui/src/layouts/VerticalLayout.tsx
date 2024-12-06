// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import clsx from 'clsx'

// Component Imports
import Content from '@repo/ui/layouts/components/vertical/Content'

// Util Imports
import { verticalLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

type VerticalLayoutProps = {
  children: ReactNode
  navigation?: ReactNode
  header?: ReactNode
}

const VerticalLayout = (props: VerticalLayoutProps) => {
  // Props
  const { header, navigation, children } = props

  return (
    <div className={clsx(verticalLayoutClasses.root, 'flex flex-auto')}>
      {navigation ?? null}
      <div className={clsx(verticalLayoutClasses.content, 'min-is-0 is-full flex flex-col')}>
        {header ?? null}
        {/* Content */}
        <Content>{children}</Content>
      </div>
    </div>
  )
}

export default VerticalLayout
