// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { TbAlertCircle } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import Trans from '@repo/i18n/Trans'

// Component Imports
import View from './View'

export const metadata: Metadata = {
  title: 'View Permission'
}

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

  // Fetch the roles assigned to this permission with proper join
  const { data: permissionRoles, error: rolesError } = await supabase
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

export default ViewPage
