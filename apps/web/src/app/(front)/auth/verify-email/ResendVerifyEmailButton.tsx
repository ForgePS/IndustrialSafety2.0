'use client'

// React Imports
import { useTransition } from 'react'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { toast } from '@repo/ui/utils/toast'

// Server Action Imports
import { verifyEmail } from '../actions'

const ResendVerifyEmailButton = ({ searchParams }: { searchParams: Record<string, string> }) => {
  // States
  const [pending, startTransition] = useTransition()

  // Vars
  const { email } = searchParams

  // Hooks
  const { t } = useTranslation()

  const handleClick = () => {
    startTransition(async () => {
      try {
        // Check if email is present in the URL
        if (!email) {
          toast('error', t('auth:verifyEmailToastEmailNotFound'))

          return
        }

        // Send verification email. The response is the same whether or not the address is registered
        // or already verified, so this page never reveals which email addresses have accounts.
        const { error } = await verifyEmail(email, `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`)

        if (error) {
          console.error(error)
          toast('error', error.message)

          return
        }

        toast('success', t('auth:verifyEmailToastSendSuccess', { email }))
      } catch (error) {
        console.error(error)
        toast('error', t('auth:verifyEmailToastError'))
      }
    })
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      {pending ? (
        <Trans i18nKey='auth:verifyEmailResendButtonLoading' />
      ) : (
        <Trans i18nKey='auth:verifyEmailResendButton' />
      )}
    </Button>
  )
}

export default ResendVerifyEmailButton
