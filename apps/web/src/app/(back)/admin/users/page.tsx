// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createServiceRoleClient } from '@repo/supabase/server'

// Component Imports
import Users from './Users'

const UserPage = async () => {
  // Vars
  const supabase = createServiceRoleClient()

  const { data: userRecord, error: userError } = await supabase
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

  return <Users usersRecord={userRecord} rolesData={rolesData} />
}

export default UserPage
