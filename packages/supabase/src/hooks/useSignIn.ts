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

export const useSignInWithPassword = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: PasswordParamsType) => {
    const { data, error } = await supabase.auth.signInWithPassword(params)

    if (error) {
      throw error.message
    }

    return data
  }

  return useMutation({
    mutationKey: ['auth:sign-in-password'],
    mutationFn
  })
}

export const useSignInWithOAuthProvider = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (provider: Provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`
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

export const useSignInWithMagicLink = () => {
  // Vars
  const supabase = createClient()

  const mutationFn = async (params: MagicLinkParamsType) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      ...params,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
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
