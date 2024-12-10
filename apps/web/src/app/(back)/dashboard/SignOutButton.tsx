'use client'

// Third-party Imports
import { TbLogout } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { useSignOut } from '@repo/supabase/hooks'

const SignOutButton = () => {
  // Hooks
  const signOutMutation = useSignOut()

  return (
    <Button variant='tonalDefault' onClick={() => signOutMutation.mutateAsync()}>
      <TbLogout className='bs-5 is-5' />
      Sign out
    </Button>
  )
}

export default SignOutButton
