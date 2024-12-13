// Third-party Imports
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

type ParamsType = {
  email: string
}

/**
 * @param redirectTo (optional) - The URL to send the user to after they click the password reset link.
 */
export const useForgotPassword = (redirectTo?: string) => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: ParamsType) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(params.email, {
      ...(redirectTo && { redirectTo })
    })

    if (error) {
      throw error.message
    }

    return data
  }

  return useMutation({
    mutationKey: ['auth:forgot-password'],
    mutationFn
  })
}
