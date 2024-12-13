// Third-party Imports
import { useForgotPassword as useSupabaseForgotPassword } from '@repo/supabase/hooks'

// Type Imports
import type { ForgotPasswordFormData } from '@repo/auth/forgot-password'

/**
 * @param redirectTo (optional) - The URL to send the user to after they click the password reset link.
 */
export const useForgotPassword = (redirectTo?: string) => {
  const forgotPasswordMutation = useSupabaseForgotPassword(redirectTo)

  const handleForgotPassword = async (formData: ForgotPasswordFormData) => {
    try {
      await forgotPasswordMutation.mutateAsync(formData)
    } catch (error) {
      throw error
    }
  }

  return {
    handleForgotPassword,
    ...forgotPasswordMutation
  }
}
