// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser, getReviewPlatforms } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Platforms from './Platforms'

export const metadata: Metadata = {
  title: 'Review Platforms'
}

const ReviewPlatformsSection = async () => {
  // Vars
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getReviewPlatforms()])

  if (error) {
    console.error('Error fetching review platforms: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Platforms platformData={data} userPermissions={user?.user_metadata.permissions} />
}

const ReviewPlatformsPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <ReviewPlatformsSection />
    </Suspense>
  )
}

export default ReviewPlatformsPage
