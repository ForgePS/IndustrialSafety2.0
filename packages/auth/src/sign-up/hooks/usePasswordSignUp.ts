// Third-party Imports
import { useSignUp } from '@repo/supabase/hooks'
import type { User } from '@supabase/supabase-js'

// Type Imports
import type { PasswordSignUpFormData } from '@repo/auth/sign-up'

type ParametersType = {
  emailRedirectTo?: string

  /** @deprecated Ignored: Supabase resends confirmation for existing unconfirmed accounts. */
  verifyEmailRedirectTo?: string
}

/**
 * It accepts an object with the following properties:
 * @param emailRedirectTo (optional) - The redirect url embedded in the email link.
 */
export const usePasswordSignUp = ({ emailRedirectTo }: ParametersType = {}) => {
  const signUpMutation = useSignUp(emailRedirectTo)

  // The optional legacy argument keeps packaged templates compiling; no client-side user directory is used.
  // Supabase handles existing unconfirmed accounts itself by resending the confirmation email.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSignUp = async (formData: PasswordSignUpFormData, _users: User[] | null = null) => {
    await signUpMutation.mutateAsync(formData)
  }

  return {
    handleSignUp,
    ...signUpMutation
  }
}
