// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbExclamationCircle } from 'react-icons/tb'
import { Alert, AlertDescription } from '@repo/ui/components/ui/alert'
import { createClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

// Component Imports
import Permissions from './Permissions'

export const metadata: Metadata = {
  title: 'Permissions'
}

const PermissionPage = async () => {
  // Vars
  const supabase = await createClient()

  const {
    data: { user }
  } = await getAuthUser()

  const { data, error } = await supabase.from('permissions').select('*').order('id', { ascending: true })

  if (error) {
    console.error('Error fetching roles: ', error.message)

    return (
      <Alert variant='destructive'>
        <TbExclamationCircle className='bs-5 is-5' />
        <AlertDescription>{error?.message}</AlertDescription>
      </Alert>
    )
  }

  return <Permissions permissionsData={data} userPermissions={user?.user_metadata.permissions} />
}

export default PermissionPage
