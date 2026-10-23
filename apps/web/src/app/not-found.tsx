// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import BlankLayout from '@repo/ui/layouts/BlankLayout'
import NotFound from '@repo/ui/components/NotFound'

export const metadata: Metadata = {
  title: { absolute: 'Page Not Found' }
}

const NotFoundPage = () => {
  return (
    <BlankLayout>
      <NotFound />
    </BlankLayout>
  )
}

export default NotFoundPage
