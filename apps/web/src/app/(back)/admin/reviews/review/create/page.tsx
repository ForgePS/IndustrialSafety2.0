// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'

// Component Imports
import CreateReview from './Create'

const CreateReviewPage = async () => {
  // Vars
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('review_platforms')
    .select('id, platform_name, slug')
    .order('id', { ascending: true })

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

export default CreateReviewPage
