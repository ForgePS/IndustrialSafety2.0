// Third-party Imports
import { useSignInWithMagicLink } from '@repo/supabase/hooks'

// Type Imports
import type { MagicLinkFormData } from '@repo/auth/sign-in'

/**
 * @param emailRedirectTo (optional) - The redirect url embedded in the email link.
 */
export const useMagicLinkSignIn = (emailRedirectTo?: string) => {
  const signInWithMagicLinkMutation = useSignInWithMagicLink(emailRedirectTo)

  const handleSignIn = async (formData: MagicLinkFormData) => {
    try {
      await signInWithMagicLinkMutation.mutateAsync(formData)
    } catch (error) {
      throw error
    }
  }

  return {
    handleSignIn,
    ...signInWithMagicLinkMutation
  }
}
