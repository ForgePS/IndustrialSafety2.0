// Next Imports
import { useRouter, usePathname } from 'next/navigation'

// Third-party Imports
import { useCookie } from 'react-use'
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

export const useSignOut = () => {
  // Hooks
  const [cookieValue, deleteCookie] = useCookie('checkoutData')
  const router = useRouter()
  const pathname = usePathname()

  // Vars
  const supabase = createClient()

  const mutationFn = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error.message
      }

      // Clean up cookies
      cookieValue && deleteCookie('checkoutData')

      // Redirect based on current path
      const shouldRedirectToLogin = ['/admin', '/dashboard', '/my-profile', '/reset-password'].some(path =>
        pathname.includes(path)
      )

      router.push(shouldRedirectToLogin ? '/auth/login' : pathname)
    } catch (error) {
      console.error('Sign-out error:', error)
      throw error
    }
  }

  return useMutation({
    mutationKey: ['auth:sign-out'],
    mutationFn
  })
}
