// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import clsx from 'clsx'

// Util Imports
import { frontLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

const Content = ({ children }: { children: ReactNode }) => {
  return (
    <main className={clsx(frontLayoutClasses.content, 'is-full [&>*]:is-full flex flex-auto flex-col')}>
      {children}
    </main>
  )
}

export default Content
