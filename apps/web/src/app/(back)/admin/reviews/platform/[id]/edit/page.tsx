// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Trans from '@repo/i18n/Trans'
import { createClient } from '@repo/supabase/server'

// Component Imports
import EditPlatform from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const { data, error } = await supabase.from('review_platforms').select().eq('id', params.id).single()

  if (!data || error) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:reviewPlatformsEditPageFetchError'
            values={{ message: error?.message || 'Unknown error' }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  return <EditPlatform platformData={data} id={params.id} userPermissions={user?.user_metadata.permissions} />
}

export default EditPage
