'use client'

// Third-party Imports
import { TbLogout } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { useSignOut } from '@repo/supabase/hooks'
import { deleteImpersonationCookies, deletePaymentCookies } from '@repo/auth/action'
import Trans from '@repo/i18n/Trans'

const SignOutButton = () => {
  // Hooks
  const signOutMutation = useSignOut()

  return (
    <Button
      variant='tonalDefault'
      onClick={() =>
        signOutMutation.mutateAsync().then(() => {
          deleteImpersonationCookies()
          deletePaymentCookies()
        })
      }
    >
      <TbLogout className='bs-5 is-5' />
      <Trans i18nKey='dashboard:signOutButton' />
    </Button>
  )
}

export default SignOutButton
