// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createServiceRoleClient, createClient } from '@repo/supabase/server'

// Component Imports
import Edit from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = createServiceRoleClient()
  const supabaseClient = await createClient()

  // Roles data
  const { data: rolesData, error: rolesError } = await supabaseClient.from('roles').select('*')

  // User data
  const { data: userRecord, error: userError } = await supabase.from('users').select('*').eq('id', params.id).single()

  // User roles data
  const { data: userRolesData, error: userRolesError } = await supabase
    .from('user_roles')
    .select(`*, roles (role)`)
    .eq('user_id', params.id)

  if (!userRecord || userError || rolesError) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          {`There was an error fetching the review. Error: ${userError?.message || rolesError?.message || userRolesError?.message || 'Unknown error'}`}
        </AlertDescription>
      </Alert>
    )
  }

  return <Edit userData={userRecord} roles={rolesData} userRolesData={userRolesData || []} id={params.id} />
}

export default EditPage
