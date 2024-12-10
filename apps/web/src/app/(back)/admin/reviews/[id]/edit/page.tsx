// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'

// Component Imports
import EditReview from './Edit'

const EditReviewPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const { data, error } = await supabase.from('reviews').select().eq('id', params.id).single()

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          {`There was an error fetching the review. Error: ${error?.message || 'Unknown error'}`}
        </AlertDescription>
      </Alert>
    )
  }

  return <EditReview reviewData={data} id={params.id} />
}

export default EditReviewPage
