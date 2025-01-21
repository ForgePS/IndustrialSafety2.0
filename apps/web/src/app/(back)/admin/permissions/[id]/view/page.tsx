// Third-party Imports
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbAlertCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'

// Component Imports
import View from './View'

const ViewPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  // Fetch the permission
  const { data: permissionData, error: permissionError } = await supabase
    .from('permissions')
    .select('*')
    .eq('id', params.id)
    .single()

  // Fetch the roles assigned to this permission
  const { data: rolesData, error: rolesError } = await supabase
    .from('role_permissions')
    .select(
      `
      roles (
        id,
        role
      )
    `
    )
    .eq('permission_id', params.id)

  if (permissionError || rolesError) {
    return (
      <Alert variant='destructive'>
        <TbAlertCircle className='bs-5 is-5' />
        <AlertDescription>
          {`There was an error fetching the data. Error: ${permissionError?.message || rolesError?.message || 'Unknown error'}`}
        </AlertDescription>
      </Alert>
    )
  }

  // Transform the data to include roles
  const permissionWithRoles = {
    ...permissionData,
    roles: rolesData?.map(item => item.roles) || []
  }

  return (
    <div className='flex flex-col gap-6'>
      <View permissionData={permissionWithRoles} />
    </div>
  )
}

export default ViewPage
