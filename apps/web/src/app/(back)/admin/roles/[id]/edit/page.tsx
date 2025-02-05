// Third-party imports
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Edit from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  // Fetch role details
  const { data: role, error: roleError } = await supabase.from('roles').select('*').eq('id', params.id).single()

  // Fetch role permissions
  const { data: rolePermissions, error: rolePermissionsError } = await supabase
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

  // Format role permissions as the Edit component expects an array of RolePermission objects
  const formattedRolePermissions = rolePermissions?.map((rp: any) => ({
    id: rp.permissions.id,
    permissions: rp.permissions.permission
  }))

  // Fetch all permissions
  const { data: permissionsData, error: permissionsDataError } = await supabase.from('permissions').select('*')

  if (roleError || rolePermissionsError || permissionsDataError) {
    console.error(
      'Error fetching role or permissions: ',
      roleError?.message || rolePermissionsError?.message || permissionsDataError?.message
    )

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          {roleError?.message || rolePermissionsError?.message || permissionsDataError?.message}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Edit
      roleData={role}
      id={params.id}
      permissionsData={permissionsData}
      rolePermissionsData={formattedRolePermissions || []}
      userPermissions={user?.user_metadata.permissions}
    />
  )
}

export default EditPage
