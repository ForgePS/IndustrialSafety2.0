// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports
import { getRole, getRolePermissionsByRoleId, getRoleWithUsers } from '@repo/supabase/serverHelpers'

import View from './View'
import ViewTable from './ViewTable'

export const metadata: Metadata = {
  title: 'View Role'
}

const RoleViewSection = async ({ roleId }: { roleId: number }) => {
  // Vars
  const [
    { data: role, error: roleError },
    { data: roleWithAssignedUsers, error: roleWithAssignedUsersError },
    { data: permissions, error: permissionsError }
  ] = await Promise.all([
    getRole(roleId),
    getRoleWithUsers(
      roleId,
      `
        *,
        users (
        name,
          email
        )
      `
    ),
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
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:rolesViewTitle' />
      </h1>
      <div className='flex flex-col gap-6'>
        <View roleData={roleData} />
        <ViewTable users={roleWithAssignedUsers} />
      </div>
    </div>
  )
}

const RoleViewPage = async (props: { params: Promise<{ id: number }> }) => {
  const params = await props.params
  const roleId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <RoleViewSection roleId={roleId} />
    </Suspense>
  )
}

export default RoleViewPage
