// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'

// Component Imports
import Reviews from './Reviews'

const ReviewPage = async () => {
  // Vars
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reviews')
    .select(
      `*,
    review_platforms (platform_name)
    `
    )
    .order('id', { ascending: true })

  if (error) {
    console.error('Error fetching reviews: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Reviews reviewData={data} />
}

export default ReviewPage
