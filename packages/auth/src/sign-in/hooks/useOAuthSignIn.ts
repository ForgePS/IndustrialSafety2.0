// Third-party Imports
import { useSignInWithOAuthProvider } from '@repo/supabase/hooks'
import type { Provider } from '@supabase/supabase-js'

/**
 * @param redirectTo (optional) - A URL to send the user to after they are confirmed.
 */
export const useOAuthSignIn = (redirectTo?: string) => {
  const signInWithOAuthProviderMutation = useSignInWithOAuthProvider(redirectTo)

  const handleSignIn = async (provider: Provider) => {
    try {
      await signInWithOAuthProviderMutation.mutateAsync(provider)
    } catch (error) {
      throw error
    }
  }

  return {
    handleSignIn,
    ...signInWithOAuthProviderMutation
  }
}
