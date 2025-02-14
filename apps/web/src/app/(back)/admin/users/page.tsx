// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAllUserRoles, getAuthUser, getUsers } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'

// Component Imports
import Users from './Users'

export const metadata: Metadata = {
  title: 'Users'
}

const UserSection = async () => {
  // Vars
  const [
    {
      data: { user }
    },
    { data: usersRecord, error: userError },
    { data: rolesData, error: rolesError }
  ] = await Promise.all([getAuthUser(), getUsers(), getAllUserRoles('*, roles (role)')])

  if (userError || rolesError) {
    console.error('Error fetching data: ', userError?.message || rolesError?.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{userError?.message || rolesError?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Users usersRecord={usersRecord} rolesData={rolesData} userPermissions={user?.user_metadata.permissions} />
}

const UserPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <UserSection />
    </Suspense>
  )
}

export default UserPage
