'use client'

// React Imports
import { useState } from 'react'

// Third-party Imports
import { toast } from 'sonner'
import { TbX } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'

// Server Action Imports
import { verifyEmail } from '../actions'

const showToast = (type: 'success' | 'error', message: string) => {
  toast[type](message, {
    cancel: {
      label: <TbX />,
      onClick: () => {}
    },
    duration: 3000
  })
}

const ResendVerifyEmailButton = ({ searchParams, users }: { searchParams: Record<string, string>; users: User[] }) => {
  // States
  const [isLoading, setIsLoading] = useState(false)

  // Vars
  const { email } = searchParams

  // Hooks
  const { t } = useTranslation()

  const handleClick = async () => {
    setIsLoading(true)

    try {
      // Check if email is present in the URL
      if (!email) {
        showToast('error', t('auth:verifyEmailToastEmailNotFound'))

        return
      }

      // Check if user already exists with the email address
      const existingUserData = users.find(user => user.email === email)

      // If user not found, show alert that says user doesn't exist
      if (!existingUserData) {
        showToast('error', t('auth:verifyEmailToastUserNotFound', { email }))

        return
      }

      // If user's email is already verified, show alert that says email is already verified
      if (existingUserData.email_confirmed_at) {
        showToast('error', t('auth:verifyEmailToastEmailVerified'))

        return
      }

      // Send verification email
      const { error } = await verifyEmail(email, `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`)

      if (error) {
        console.error(error)
        showToast('error', error.message)

        return
      }

      showToast('success', t('auth:verifyEmailToastSendSuccess', { email }))
    } catch (error) {
      console.error(error)
      showToast('error', t('auth:verifyEmailToastError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={isLoading}>
      {isLoading ? (
        <Trans i18nKey='auth:verifyEmailResendButtonLoading' />
      ) : (
        <Trans i18nKey='auth:verifyEmailResendButton' />
      )}
    </Button>
  )
}

export default ResendVerifyEmailButton
