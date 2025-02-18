// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser, getRoles } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Roles from './Roles'

export const metadata: Metadata = {
  title: 'Roles'
}

const RolesSection = async () => {
  // Vars
  const [
    {
      data: { user }
    },
    { data, error }
  ] = await Promise.all([getAuthUser(), getRoles()])

  if (error) {
    console.error('Error fetching roles: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Roles rolesData={data} userPermissions={user?.user_metadata.permissions} />
}

const RolesPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <RolesSection />
    </Suspense>
  )
}

export default RolesPage
