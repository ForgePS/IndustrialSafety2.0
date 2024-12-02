// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import FrontLayout from '@repo/ui/layouts/FrontLayout'

// Component Imports
import Header from '@components/layout/front/Header'
import Footer from '@components/layout/front/Footer'

const FrontPagesLayout = ({ children }: { children: ReactNode }) => {
  return (
    <FrontLayout header={<Header />} footer={<Footer />}>
      {children}
    </FrontLayout>
  )
}

export default FrontPagesLayout
