// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getReviewPlatforms } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import CreateReview from './Create'

export const metadata: Metadata = {
  title: 'Create Review'
}

const CreateReviewSection = async () => {
  // Vars
  const { data, error } = await getReviewPlatforms('id, platform_name, slug')

  if (error) {
    console.error('Error fetching review platforms: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <CreateReview platformsData={data} />
}

const CreateReviewPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <CreateReviewSection />
    </Suspense>
  )
}

export default CreateReviewPage
