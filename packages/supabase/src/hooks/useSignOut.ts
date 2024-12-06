// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { useCookie } from 'react-use'
import { useMutation } from '@tanstack/react-query'

// Util Imports
import { createClient } from '@repo/supabase/client'

export const useSignOut = () => {
  // Hooks
  const [cookieValue, deleteCookie] = useCookie('checkoutData')
  const router = useRouter()

  // Vars
  const supabase = createClient()

  const mutationFn = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error.message
    }

    cookieValue && deleteCookie('checkoutData')
    router.push('/auth/login')
  }

  return useMutation({
    mutationKey: ['auth:sign-out'],
    mutationFn
  })
}
