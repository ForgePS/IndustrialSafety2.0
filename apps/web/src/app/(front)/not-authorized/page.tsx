// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import NotAuthorized from '@repo/ui/components/NotAuthorized'

export const metadata: Metadata = {
  title: { absolute: 'Not Authorized' },
  alternates: {
    canonical: 'https://demos.themeselection.com/jetship-nextjs-starter-kit-demo'
  }
}

const NotAuthorizedPage = () => {
  return <NotAuthorized />
}

export default NotAuthorizedPage
