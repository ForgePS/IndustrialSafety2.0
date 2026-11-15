'use client'

import { useMutation } from '@tanstack/react-query'

import { useSignOut as useSupabaseSignOut } from '@repo/supabase/hooks'

const cognito = process.env.NEXT_PUBLIC_FORGE_AUTH_PROVIDER === 'cognito'

/**
 * Sign-out for 2.0's buttons. Inside 1.0 (NEXT_PUBLIC_FORGE_AUTH_PROVIDER=cognito) this ends 1.0's
 * session, which signs the person out of both, then goes to 1.0's sign-in page. 2.0's own token
 * cookie is dropped by the middleware on the next request, once 1.0's session cookie is gone.
 */
export const useSignOut = () => {
  const supabaseSignOut = useSupabaseSignOut()

  const cognitoSignOut = useMutation({
    mutationKey: ['auth:sign-out:platform'],
    mutationFn: async () => {
      const logoutUrl = process.env.NEXT_PUBLIC_FORGE_PLATFORM_LOGOUT_URL || '/api/v1/auth/session/logout'

      // 1.0 clears its session cookie even when this fails, so leave regardless.
      await fetch(logoutUrl, { method: 'POST', credentials: 'include' }).catch(() => null)
      window.location.assign(process.env.NEXT_PUBLIC_FORGE_PLATFORM_LOGIN_URL || '/')
    }
  })

  return cognito ? cognitoSignOut : supabaseSignOut
}
