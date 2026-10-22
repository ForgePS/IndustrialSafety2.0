import { useRouter } from 'next/navigation'
import { EMAIL_NOT_CONFIRMED_ERROR, useSignInWithPassword } from '@repo/supabase/hooks'
import type { User } from '@supabase/supabase-js'

import type { PasswordSignInFormData } from '@repo/auth/sign-in'

/** Authenticate with the provider; never require a client-side user directory. */
export const usePasswordSignIn = (verifyEmailRedirectTo?: string) => {
  const router = useRouter()
  const signInWithPasswordMutation = useSignInWithPassword()

  // The optional legacy argument preserves compatibility with packaged login templates.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSignIn = async (formData: PasswordSignInFormData, _users: User[] | null = null, redirectTo: string = '') => {
    try {
      await signInWithPasswordMutation.mutateAsync(formData)
    } catch (error) {
      // Only the authentication provider decides whether credentials are valid
      // and whether email confirmation is still required.
      if (verifyEmailRedirectTo && error === EMAIL_NOT_CONFIRMED_ERROR) {
        const target = new URL(verifyEmailRedirectTo, window.location.origin)

        target.searchParams.set('email', formData.email)
        router.push(target.pathname + target.search)

        return
      }

      throw error
    }

    // A fresh document loads server components with the newly established session,
    // avoiding a race between client navigation, auth updates, and router refresh.
    const loginSuffix = /\/auth\/login\/?$/
    const basePath = loginSuffix.test(window.location.pathname) ? window.location.pathname.replace(loginSuffix, '') : ''
    const target = new URL(redirectTo || '/', window.location.origin)

    if (target.origin !== window.location.origin) {
      window.location.assign(basePath + '/')

      return
    }

    const pathname =
      basePath && target.pathname !== basePath && !target.pathname.startsWith(basePath + '/')
        ? basePath + target.pathname
        : target.pathname

    window.location.assign(pathname + target.search + target.hash)
  }

  return { handleSignIn, ...signInWithPasswordMutation }
}
