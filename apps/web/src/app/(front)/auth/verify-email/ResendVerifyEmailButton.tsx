'use client'

// React Imports
import { useState } from 'react'

// Third-party Imports
import { toast } from 'sonner'
import { TbX } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
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

  const handleClick = async () => {
    setIsLoading(true)

    try {
      // Check if email is present in the URL
      if (!email) {
        showToast('error', 'Email not found in the URL. Please go to the login or register page and try again.')

        return
      }

      // Check if user already exists with the email address
      const existingUserData = users.find(user => user.email === email)

      // If user not found, show alert that says user doesn't exist
      if (!existingUserData) {
        showToast('error', `User with email ${email} not found.`)

        return
      }

      // If user's email is already verified, show alert that says email is already verified
      if (existingUserData.email_confirmed_at) {
        showToast('error', 'Email is already verified. Please login to continue.')

        return
      }

      // Send verification email
      const { error } = await verifyEmail(email, `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`)

      if (error) {
        console.error(error)
        showToast('error', error.message)

        return
      }

      showToast('success', `Verification email sent successfully to ${email}.`)
    } catch (error) {
      console.error(error)
      showToast('error', 'An unexpected error occurred. Please try again later.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={isLoading}>
      {isLoading ? 'Sending...' : 'Resend Verification Email'}
    </Button>
  )
}

export default ResendVerifyEmailButton
