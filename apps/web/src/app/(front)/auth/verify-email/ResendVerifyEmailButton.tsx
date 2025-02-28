'use client'

// React Imports
import { useTransition } from 'react'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { toast } from '@repo/ui/utils/toast'

// Server Action Imports
import { verifyEmail } from '../actions'

const ResendVerifyEmailButton = ({ searchParams, users }: { searchParams: Record<string, string>; users: User[] }) => {
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

        // Check if user already exists with the email address
        const existingUserData = users.find(user => user.email === email)

        // If user not found, show alert that says user doesn't exist
        if (!existingUserData) {
          toast('error', t('auth:verifyEmailToastUserNotFound', { email }))

          return
        }

        // If user's email is already verified, show alert that says email is already verified
        if (existingUserData.email_confirmed_at) {
          toast('error', t('auth:verifyEmailToastEmailVerified'))

          return
        }

        // Send verification email
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
