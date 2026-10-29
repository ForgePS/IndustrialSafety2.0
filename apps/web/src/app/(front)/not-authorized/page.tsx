// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import NotAuthorized from '@repo/ui/components/NotAuthorized'

export const metadata: Metadata = {
  title: { absolute: 'Not Authorized' }
}

const NotAuthorizedPage = () => {
  return <NotAuthorized />
}

export default NotAuthorizedPage
