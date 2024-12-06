// Third-party Imports
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

type ParamsType = {
  email: string
  password: string
  'confirm-password': string
}

export const useSignUp = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: ParamsType) => {
    const { data, error } = await supabase.auth.signUp({
      ...params,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
        data: { name: params.email.split('@')[0] }
      }
    })

    if (error) {
      throw error.message
    }

    const user = data.user
    const identities = user?.identities ?? []

    if (identities.length === 0) {
      throw new Error('User already exists with this email address.')
    }

    return data
  }

  return useMutation({
    mutationKey: ['auth:sign-up'],
    mutationFn
  })
}
