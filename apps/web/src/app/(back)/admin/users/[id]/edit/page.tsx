// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getRoles, getServiceUser, getServiceUserRoles } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Edit from './Edit'

export const metadata: Metadata = {
  title: 'Edit User'
}

const EditSection = async ({ userId }: { userId: number }) => {
  // Vars
  const [
    { data: rolesData, error: rolesError },
    { data: userRecord, error: userError },
    { data: userRolesData, error: userRolesError }
  ] = await Promise.all([getRoles(), getServiceUser(userId), getServiceUserRoles(userId, '*, roles (role)')])

  if (!userRecord || userError || rolesError) {
    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>
          <Trans
            i18nKey='admin:usersEditPageError'
            values={{
              message: userError?.message || rolesError?.message || userRolesError?.message || 'Unknown error'
            }}
          />
        </AlertDescription>
      </Alert>
    )
  }

  return <Edit userData={userRecord} roles={rolesData} userRolesData={userRolesData || []} id={userId} />
}

const EditPage = async (props: { params: Promise<{ id: number }> }) => {
  // Vars
  const params = await props.params
  const userId = Number(params.id)

  return (
    <Suspense fallback={<Loader />}>
      <EditSection userId={userId} />
    </Suspense>
  )
}

export default EditPage
