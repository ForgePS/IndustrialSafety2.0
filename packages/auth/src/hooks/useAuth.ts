'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@repo/supabase/client'
import { getPublicUser } from '@repo/supabase/clientHelpers'
import type { Database } from '@repo/supabase/types'

type AuthState = {
  user: Database['public']['Tables']['users']['Row'] | null
  isImpersonating: boolean
  originalUser: Database['public']['Tables']['users']['Row'] | null
  impersonatedUser: Database['public']['Tables']['users']['Row'] | null
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isImpersonating: false,
    originalUser: null,
    impersonatedUser: null
  })

  const supabase = createClient()

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const { data: userRecord, error } = await getPublicUser()

          if (error) throw error

          setAuthState(prev => ({
            ...prev,
            user: userRecord
          }))
        } catch (error) {
          console.error('Error fetching user data:', error)

          // Handle error appropriately
        }
      } else {
        setAuthState({
          user: null,
          isImpersonating: false,
          originalUser: null,
          impersonatedUser: null
        })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startImpersonation = async (usersRecord: Database['public']['Tables']['users']['Row'][], userId: string) => {
    const { data: userRecord } = await getPublicUser()
    const { data: userRoles } = await supabase.from('user_roles').select(`*, roles (role)`).eq('user_id', userRecord.id)
    const roles = userRoles?.map(({ roles }) => roles.role)

    if (!roles?.includes('admin')) {
      throw new Error('Only admins can impersonate users')
    }

    try {
      const impersonatedUser = usersRecord.find(user => user.user_id === userId)

      if (!impersonatedUser) {
        throw new Error('Failed to find user to impersonate')
      }

      setAuthState({
        user: impersonatedUser,
        isImpersonating: true,
        originalUser: authState.user,
        impersonatedUser: impersonatedUser
      })
    } catch (error) {
      console.error('Impersonation error:', error)
      throw error
    }
  }

  const stopImpersonation = async () => {
    if (!authState.isImpersonating || !authState.originalUser) {
      return
    }

    try {
      setAuthState({
        user: authState.originalUser,
        isImpersonating: false,
        originalUser: null,
        impersonatedUser: null
      })
    } catch (error) {
      console.error('Error stopping impersonation:', error)
      throw error
    }
  }

  return {
    ...authState,
    startImpersonation,
    stopImpersonation
  }
}
