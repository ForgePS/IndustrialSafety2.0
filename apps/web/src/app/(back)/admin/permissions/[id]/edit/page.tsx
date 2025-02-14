// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party imports
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbExclamationCircle } from 'react-icons/tb'
import { getAuthUser, getPermission, getRolePermissionsByPermissionId, getRoles } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Edit from './Edit'

export const metadata: Metadata = {
  title: 'Edit Permission'
}

const EditPermissionSection = async ({ permissionId }: { permissionId: number }) => {
  // Vars
  const [
    {
      data: { user }
    },
    { data: permission, error: permissionError },
    { data: rolesData, error: rolesError },
    { data: permissionRoles, error: permissionRolesError }
  ] = await Promise.all([
    getAuthUser(),
    getPermission(permissionId),
    getRoles(),
    getRolePermissionsByPermissionId(
      permissionId,
      `
        permission_id,
        role_id,
        roles:roles (
          id,
          role
        )
      `
    )
  ])

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
      id={permissionId}
      permissionData={permission}
      rolesData={rolesData}
      permissionRolesData={formattedPermissionRoles || []}
      userPermissions={user?.user_metadata.permissions}
    />
  )
}

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const permissionId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditPermissionSection permissionId={permissionId} />
    </Suspense>
  )
}

export default EditPage
