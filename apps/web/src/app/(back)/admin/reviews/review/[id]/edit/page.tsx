// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Trans from '@repo/i18n/Trans'

// Component Imports
import EditReview from './Edit'

const EditReviewPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const { data: reviewData, error: reviewError } = await supabase
    .from('reviews')
    .select(
      `*,
    review_platforms (platform_name)`
    )
    .eq('id', params.id)
    .single()

  const { data: platformsData, error: platformsError } = await supabase
    .from('review_platforms')
    .select('id, platform_name, slug')
    .order('id', { ascending: true })

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

  return <EditReview reviewData={reviewData} platformsData={platformsData} id={params.id} />
}

export default EditReviewPage
