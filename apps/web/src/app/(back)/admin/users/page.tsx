// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Users from './Users'

export const metadata: Metadata = {
  title: 'Users'
}

const UserPage = async () => {
  // Vars
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const { data: usersRecord, error: userError } = await supabase
    .from('users')
    .select('*')
    .order('id', { ascending: true, nullsFirst: false })

  const { data: rolesData, error: rolesError } = await supabase.from('user_roles').select(`*, roles (role)`)

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

export default UserPage
