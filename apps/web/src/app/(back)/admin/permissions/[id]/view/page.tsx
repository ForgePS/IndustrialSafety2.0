// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbAlertCircle } from 'react-icons/tb'
import { getPermission, getRolePermissionsByPermissionId } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports

import View from './View'

export const metadata: Metadata = {
  title: 'View Permission'
}

const ViewPermissionSection = async ({ permissionId }: { permissionId: number }) => {
  // Vars
  const [{ data: permissionData, error: permissionError }, { data: permissionRoles, error: rolesError }] =
    await Promise.all([
      getPermission(permissionId),
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

  if (permissionError || rolesError) {
    return (
      <Alert variant='destructive'>
        <TbAlertCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:permissionsViewPageFetchError'
            values={{ message: permissionError?.message || rolesError?.message || 'Unknown error' }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  // Transform the data to include roles with null check
  const formattedRoles =
    permissionRoles?.map(pr => ({
      id: pr.role_id,

      // @ts-ignore
      role: pr.roles?.role
    })) || []

  const permissionWithRoles = {
    ...permissionData,
    roles: formattedRoles
  }

  return (
    <div className='flex flex-col gap-6'>
      <View permissionData={permissionWithRoles} />
    </div>
  )
}

const ViewPermissionPage = async (props: { params: Promise<{ id: number }> }) => {
  const params = await props.params
  const permissionId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <ViewPermissionSection permissionId={permissionId} />
    </Suspense>
  )
}

export default ViewPermissionPage
