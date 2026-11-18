// Next Imports
import type { Metadata } from 'next'

// Component Imports
import NotFound from '@repo/ui/components/NotFound'

export const metadata: Metadata = {
  title: { absolute: 'Page Not Found' }
}

const NotFoundPage = () => {
  return <NotFound />
}

export default NotFoundPage
