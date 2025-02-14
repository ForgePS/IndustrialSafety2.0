// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser, getPermissions } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Permissions from './Permissions'

export const metadata: Metadata = {
  title: 'Permissions'
}

const PermissionSection = async () => {
  // Vars
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getPermissions()])

  if (error) {
    console.error('Error fetching permissions: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Permissions permissionsData={data} userPermissions={user?.user_metadata.permissions} />
}

const PermissionPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <PermissionSection />
    </Suspense>
  )
}

export default PermissionPage
