// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'

// Component Imports
import View from './View'
import ViewTable from './ViewTable'

const RoleViewPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  // Fetch role details
  const { data: role, error: roleError } = await supabase.from('roles').select('*').eq('id', params.id).single()

  // Fetch role permissions
  const { data: permissions, error: permissionsError } = await supabase
    .from('role_permissions')
    .select(
      `
      permissions (
        id,
        permission
      )
    `
    )
    .eq('role_id', params.id)

  // Fetch role with users
  const { data: roleWithAssignedUsers, error: roleWithAssignedUsersError } = await supabase
    .from('roles')
    .select(
      `
      *,
      users (
       name,
        email
      )
    `
    )
    .eq('id', params.id)

  if (permissionsError || roleError || roleWithAssignedUsersError) {
    console.error(
      'Error fetching permissions: ',
      permissionsError?.message || roleError?.message || roleWithAssignedUsersError?.message
    )

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          {permissionsError?.message || roleError?.message || roleWithAssignedUsersError?.message}
        </AlertDescription>
      </Alert>
    )
  }

  const roleData = {
    ...role,
    permissions: permissions.map(p => p.permissions)
  }

  return (
    <div className='flex flex-col gap-6'>
      <View roleData={roleData} />
      <ViewTable users={roleWithAssignedUsers} />
    </div>
  )
}

export default RoleViewPage
