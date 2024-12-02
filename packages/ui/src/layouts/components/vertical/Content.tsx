// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import clsx from 'clsx'

// Util Imports
import { verticalLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

const Content = ({ children }: { children: ReactNode }) => {
  return (
    <main className={clsx(verticalLayoutClasses.content, 'is-full mli-auto max-is-[1400px] flex-auto p-6')}>
      {children}
    </main>
  )
}

export default Content
