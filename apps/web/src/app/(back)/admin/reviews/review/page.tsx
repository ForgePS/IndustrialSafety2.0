// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser, getReviews } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Reviews from './Reviews'

export const metadata: Metadata = {
  title: 'Reviews'
}

const ReviewsSection = async () => {
  // Vars
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getReviews('*, review_platforms (platform_name)')])

  if (error) {
    console.error('Error fetching reviews: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Reviews reviewData={data} userPermissions={user?.user_metadata.permissions} />
}

const ReviewsPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <ReviewsSection />
    </Suspense>
  )
}

export default ReviewsPage
