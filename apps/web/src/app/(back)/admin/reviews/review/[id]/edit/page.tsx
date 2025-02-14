// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser, getReview, getReviewPlatforms } from '@repo/supabase/serverHelpers'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports
import EditReview from './Edit'

export const metadata: Metadata = {
  title: 'Edit Review'
}

const EditReviewSection = async ({ reviewId }: { reviewId: number }) => {
  // Vars
  const [
    {
      data: { user }
    },
    { data: reviewData, error: reviewError },
    { data: platformsData, error: platformsError }
  ] = await Promise.all([
    getAuthUser(),
    getReview(reviewId, '*, review_platforms (platform_name)'),
    getReviewPlatforms('id, platform_name, slug')
  ])

  if (!reviewData || reviewError || !platformsData || platformsError) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:reviewsEditPageFetchError'
            values={{ message: reviewError?.message || platformsError?.message || 'Unknown error' }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <EditReview
      reviewData={reviewData}
      platformsData={platformsData}
      id={reviewId}
      userPermissions={user?.user_metadata.permissions}
    />
  )
}

const EditReviewPage = async (props: { params: Promise<{ id: number }> }) => {
  const params = await props.params
  const reviewId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditReviewSection reviewId={reviewId} />
    </Suspense>
  )
}

export default EditReviewPage
