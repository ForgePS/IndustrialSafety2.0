// Third-party Imports
import { useResetPassword as useSupabaseResetPassword } from '@repo/supabase/hooks'

// Type Imports
import type { ResetPasswordFormData } from '@repo/auth/reset-password'

export const useResetPassword = () => {
  const resetPasswordMutation = useSupabaseResetPassword()

  const handleResetPassword = async (formData: ResetPasswordFormData) => {
    try {
      await resetPasswordMutation.mutateAsync({ password: formData.password })
    } catch (error) {
      throw error
    }
  }

  return {
    handleResetPassword,
    ...resetPasswordMutation
  }
}
