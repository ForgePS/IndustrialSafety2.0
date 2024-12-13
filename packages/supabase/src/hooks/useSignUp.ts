// Third-party Imports
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

type ParamsType = {
  email: string
  password: string
  'confirm-password': string
}

/**
 * @param emailRedirectTo (optional) - The redirect url embedded in the email link.
 */
export const useSignUp = (emailRedirectTo?: string) => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: ParamsType) => {
    const { data, error } = await supabase.auth.signUp({
      ...params,
      options: {
        ...(emailRedirectTo && { emailRedirectTo }),
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
