// Next Imports
import type { Metadata } from 'next'

// Third-party imports
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Edit from './Edit'

export const metadata: Metadata = {
  title: 'Edit Permission'
}

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  // Fetch permission details
  const { data: permission, error: permissionError } = await supabase
    .from('permissions')
    .select('*')
    .eq('id', params.id)
    .single()

  // Fetch all roles
  const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*')

  // Fetch permission roles with proper join
  const { data: permissionRoles, error: permissionRolesError } = await supabase
    .from('role_permissions')
    .select(
      `
      permission_id,
      role_id,
      roles:roles (
        id,
        role
      )
    `
    )
    .eq('permission_id', params.id)

  // Format permission roles as the Edit component expects
  const formattedPermissionRoles = permissionRoles?.map((pr: any) => ({
    id: pr.role_id,
    role: pr.roles?.role
  }))

  if (permissionError || rolesError || permissionRolesError) {
    console.error(
      'Error fetching data: ',
      permissionError?.message || rolesError?.message || permissionRolesError?.message
    )

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:permissionsEditPageFetchError'
            values={{ message: permissionError?.message || rolesError?.message || permissionRolesError?.message }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Edit
      id={params.id}
      permissionData={permission}
      rolesData={rolesData}
      permissionRolesData={formattedPermissionRoles || []}
      userPermissions={user?.user_metadata.permissions}
    />
  )
}

export default EditPage
