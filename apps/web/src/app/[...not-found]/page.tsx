// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import BlankLayout from '@repo/ui/layouts/BlankLayout'
import NotFound from '@repo/ui/components/NotFound'

export const metadata: Metadata = {
  title: 'Page Not Found',
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
  }
}

const NotFoundPage = () => {
  return (
    <BlankLayout>
      <NotFound />
    </BlankLayout>
  )
}

export default NotFoundPage
