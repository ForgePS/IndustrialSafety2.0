// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Platforms from './Platforms'

const ReviewPlatformsPage = async () => {
  // Vars
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const { data, error } = await supabase.from('review_platforms').select('*').order('id', { ascending: true })

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

export default ReviewPlatformsPage
