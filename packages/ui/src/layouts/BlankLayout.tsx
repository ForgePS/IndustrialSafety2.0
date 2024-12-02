// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import clsx from 'clsx'

// Util Imports
import { blankLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

const BlankLayout = ({ children }: { children: ReactNode }) => {
  return <div className={clsx(blankLayoutClasses.root, 'is-full bs-full')}>{children}</div>
}

export default BlankLayout
