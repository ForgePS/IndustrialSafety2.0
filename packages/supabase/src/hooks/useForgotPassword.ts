// Third-party Imports
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

type ParamsType = {
  email: string
}

export const useForgotPassword = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: ParamsType) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(params.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`
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
