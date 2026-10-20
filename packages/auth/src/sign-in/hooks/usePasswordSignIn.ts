import { useRouter } from 'next/navigation'
import { useSignInWithPassword } from '@repo/supabase/hooks'
import type { User } from '@supabase/supabase-js'
import type { PasswordSignInFormData } from '@repo/auth/sign-in'

/** Authenticate with the provider; never require a client-side user directory. */
export const usePasswordSignIn = (verifyEmailRedirectTo?: string) => {
  const router = useRouter()
  const signInWithPasswordMutation = useSignInWithPassword()

  // The optional legacy argument preserves compatibility with packaged login templates.
  const handleSignIn = async (formData: PasswordSignInFormData, _users: User[] | null = null, redirectTo: string = '') => {
    try {
      await signInWithPasswordMutation.mutateAsync(formData)
    } catch (error) {
      // Only the authentication provider decides whether credentials are valid
      // and whether email confirmation is still required.
      if (verifyEmailRedirectTo && String(error).toLowerCase() === 'email not confirmed') {
        const target = new URL(verifyEmailRedirectTo, window.location.origin)
        target.searchParams.set('email', formData.email)
        router.push(target.pathname + target.search)
        return
      }
      throw error
    }

    // A fresh document loads server components with the newly established session,
    // avoiding a race between client navigation, auth updates, and router refresh.
    const target = new URL(redirectTo || '/', window.location.origin)
    window.location.assign(target.origin === window.location.origin ? target.href : '/')
  }

  return { handleSignIn, ...signInWithPasswordMutation }
}
