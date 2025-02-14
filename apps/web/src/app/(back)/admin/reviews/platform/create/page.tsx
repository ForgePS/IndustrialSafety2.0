// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Create from './Create'

export const metadata: Metadata = {
  title: 'Create Review Platform'
}

const CreateReviewPlatformPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Create />
    </Suspense>
  )
}

export default CreateReviewPlatformPage
