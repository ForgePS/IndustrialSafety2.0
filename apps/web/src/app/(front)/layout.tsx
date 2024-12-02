// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import BlankLayout from '@repo/ui/layouts/BlankLayout'

const Layout = ({ children }: { children: ReactNode }) => {
  return <BlankLayout>{children}</BlankLayout>
}

export default Layout
