// Third-party imports
import { createClient } from '@repo/supabase/server'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbExclamationCircle } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Edit from './Edit'

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const supabase = await createClient()

  // Fetch permission details
  const { data: permission, error: permissionError } = await supabase
    .from('permissions')
    .select('*')
    .eq('id', params.id)
    .single()

  // Fetch all roles
  const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*')

  // Fetch permission roles
  const { data: permissionRoles, error: permissionRolesError } = await supabase
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

  // Format permission roles as the Edit component expects
  const formattedPermissionRoles = permissionRoles?.map((pr: any) => ({
    id: pr.roles.id,
    role: pr.roles.role
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
    />
  )
}

export default EditPage
