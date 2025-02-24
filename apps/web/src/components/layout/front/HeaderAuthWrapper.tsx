'use client'

// React Imports
import { useEffect } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { createClient } from '@repo/supabase/client'

const HeaderAuthWrapper = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // Ensure we refresh the app state after the auth state has actually changed
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase])

  return <>{children}</>
}

export default HeaderAuthWrapper
