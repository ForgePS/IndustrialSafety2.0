// Third-party Imports
import { useRouter } from 'next/navigation'
import { useSignInWithPassword } from '@repo/supabase/hooks'
import type { User } from '@supabase/supabase-js'

// Type Imports
import type { PasswordSignInFormData } from '@repo/auth/sign-in'

/**
 * @param verifyEmailRedirectTo (optional) - The redirection URL to the verify email page for unconfirmed users.
 */
export const usePasswordSignIn = (verifyEmailRedirectTo?: string) => {
  const router = useRouter()
  const signInWithPasswordMutation = useSignInWithPassword()

  const handleSignIn = async (formData: PasswordSignInFormData, users: User[] | null) => {
    // Check if user already exists with the email address
    const existingUserData = users?.find(user => user.email === formData.email)

    // If user exists but email is not confirmed, return early with redirect info
    if (existingUserData && !existingUserData.email_confirmed_at) {
      if (verifyEmailRedirectTo) {
        router.push(verifyEmailRedirectTo)
      } else {
        throw new Error('Email is not verified. Please verify your email address.')
      }

      return
    }

    try {
      await signInWithPasswordMutation.mutateAsync(formData).then(() => router.push('/dashboard'))
    } catch (error) {
      throw error
    }
  }

  return {
    handleSignIn,
    ...signInWithPasswordMutation
  }
}
