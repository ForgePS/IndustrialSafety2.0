// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party imports
import { getAuthUser, getPermissions, getRole, getRolePermissionsByRoleId } from '@repo/supabase/serverHelpers'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbExclamationCircle } from 'react-icons/tb'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Edit from './Edit'

export const metadata: Metadata = {
  title: 'Edit Role'
}

const EditRolesSection = async ({ roleId }: { roleId: number }) => {
  // Vars
  const [
    {
      data: { user }
    },
    { data: role, error: roleError },
    { data: permissionsData, error: permissionsDataError },
    { data: rolePermissions, error: rolePermissionsError }
  ] = await Promise.all([
    getAuthUser(),
    getRole(roleId),
    getPermissions(),
    getRolePermissionsByRoleId(
      roleId,
      `
        permissions (
          id,
          permission
        )
      `
    )
  ])

  // Format role permissions as the Edit component expects an array of RolePermission objects
  const formattedRolePermissions = rolePermissions?.map((rp: any) => ({
    id: rp.permissions.id,
    permissions: rp.permissions.permission
  }))

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
      id={roleId}
      permissionsData={permissionsData}
      rolePermissionsData={formattedRolePermissions || []}
      userPermissions={user?.user_metadata.permissions}
    />
  )
}

const EditRolesPage = async (props: { params: Promise<{ id: number }> }) => {
  const params = await props.params
  const roleId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditRolesSection roleId={roleId} />
    </Suspense>
  )
}

export default EditRolesPage
