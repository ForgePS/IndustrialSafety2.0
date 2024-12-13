// Third-party Imports
import { useRouter } from 'next/navigation'
import { useSignUp } from '@repo/supabase/hooks'
import type { User } from '@supabase/supabase-js'

// Type Imports
import type { PasswordSignUpFormData } from '@repo/auth/sign-up'

type ParametersType = {
  emailRedirectTo?: string
  verifyEmailRedirectTo?: string
}

/**
 * It accepts an object with the following properties:
 * @param emailRedirectTo (optional) - The redirect url embedded in the email link.
 * @param verifyEmailRedirectTo (optional) - The redirection URL to the verify email page for unconfirmed users.
 */
export const usePasswordSignUp = ({ emailRedirectTo, verifyEmailRedirectTo }: ParametersType = {}) => {
  const router = useRouter()
  const signUpMutation = useSignUp(emailRedirectTo)

  const handleSignUp = async (formData: PasswordSignUpFormData, users: User[] | null) => {
    // Check if user already exists with the email address
    const existingUserData = users?.find(user => user.email === formData.email)

    // If user exists but email is not confirmed, redirect to verify email page
    if (existingUserData && !existingUserData.email_confirmed_at) {
      if (verifyEmailRedirectTo) {
        router.push(verifyEmailRedirectTo)
      } else {
        throw new Error('Email is not verified. Please verify your email address.')
      }

      return
    }

    try {
      await signUpMutation.mutateAsync(formData)
    } catch (error) {
      throw error
    }
  }

  return {
    handleSignUp,
    ...signUpMutation
  }
}
