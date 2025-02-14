// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { getAuthUser, getRoles } from '@repo/supabase/serverHelpers'

// Component Imports
import Roles from './Roles'

export const metadata: Metadata = {
  title: 'Roles'
}

const RolesPage = async () => {
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

export default RolesPage
