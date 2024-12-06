// Third-party Imports
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

type ParamsType = {
  password: string
}

export const useResetPassword = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: ParamsType) => {
    const { data, error } = await supabase.auth.updateUser(params)

    if (error) {
      throw error.message
    }

    return data
  }

  return useMutation({
    mutationKey: ['auth:reset-password'],
    mutationFn
  })
}
