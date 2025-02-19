// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import NotAuthorized from '@repo/ui/components/NotAuthorized'

export const metadata: Metadata = {
  title: { absolute: 'Not Authorized' },
  alternates: {
    canonical: 'https://jetship-nextjs-saas-boilerplate-demo.vercel.app/not-authorized'
  }
}

const NotAuthorizedPage = () => {
  return <NotAuthorized />
}

export default NotAuthorizedPage
