// Third-party Imports
import { useMutation } from '@tanstack/react-query'
import type { Provider } from '@supabase/supabase-js'

// Util Imports
import { createClient } from '@repo/supabase/client'

type PasswordParamsType = {
  email: string
  password: string
}

type MagicLinkParamsType = {
  email: string
}

/** Thrown by `useSignInWithPassword` when the account exists but its email is not confirmed yet. */
export const EMAIL_NOT_CONFIRMED_ERROR = 'Email not confirmed'

export const useSignInWithPassword = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: PasswordParamsType) => {
    const { data, error } = await supabase.auth.signInWithPassword(params)

    if (error) {
      // Decide on the stable error code, not the provider's wording, so callers can branch reliably.
      throw error.code === 'email_not_confirmed' ? EMAIL_NOT_CONFIRMED_ERROR : error.message
    }

    return data
  }

  return useMutation({
    mutationKey: ['auth:sign-in-password'],
    mutationFn
  })
}

/**
 * @param redirectTo (optional) - A URL to send the user to after they are confirmed.
 */
export const useSignInWithOAuthProvider = (redirectTo?: string) => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (provider: Provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        ...(redirectTo && { redirectTo })
      }
    })

    if (error) {
      throw error.message
    }
  }

  return useMutation({
    mutationKey: ['auth:sign-in-oauth'],
    mutationFn
  })
}

/**
 * @param emailRedirectTo (optional) - The redirect url embedded in the email link.
 */
export const useSignInWithMagicLink = (emailRedirectTo?: string) => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: MagicLinkParamsType) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      ...params,
      options: {
        ...(emailRedirectTo && { emailRedirectTo }),
        data: { name: params.email.split('@')[0] }
      }
    })

    if (error) {
      throw error.message
    }

    return data
  }

  return useMutation({
    mutationKey: ['auth:sign-in-magic-link'],
    mutationFn
  })
}
