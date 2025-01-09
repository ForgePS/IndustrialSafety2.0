'use client'

// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { createClient } from '@repo/supabase/client'
import { getPublicUser, getUserPermissions } from '@repo/supabase/clientHelpers'
import { useObjectCookie } from '@repo/ui/hooks/useObjectCookie'
import type { Database } from '@repo/supabase/types'

// Action Imports
import { impersonateUser, stopImpersonatingUser } from '@repo/auth/action'

// Var
const IMPERSONATION_STATE_COOKIE = 'impersonation_state'

type AuthState = {
  user: Database['public']['Tables']['users']['Row'] | null
  isImpersonating: boolean
  originalUser: Database['public']['Tables']['users']['Row'] | null
  impersonatedUser: Database['public']['Tables']['users']['Row'] | null
}

type ImpersonationState = Omit<AuthState, 'user'>

const defaultImpersonationState: ImpersonationState = {
  isImpersonating: false,
  originalUser: null,
  impersonatedUser: null
}

export function useAuth() {
  // States
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    ...defaultImpersonationState
  })

  const [isInitialized, setIsInitialized] = useState(false)

  // Hooks
  const [cookieState, setCookieState] = useObjectCookie<ImpersonationState>(IMPERSONATION_STATE_COOKIE)

  const supabase = createClient()

  // Initialize state from cookie only if there's an active impersonation
  useEffect(() => {
    if (cookieState?.isImpersonating) {
      setAuthState(prev => ({
        ...prev,
        isImpersonating: cookieState.isImpersonating,
        originalUser: cookieState.originalUser,
        impersonatedUser: cookieState.impersonatedUser
      }))
    }

    if (!isInitialized) {
      setIsInitialized(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookieState])

  // Check for active impersonation on initial load
  useEffect(() => {
    const checkImpersonation = async () => {
      try {
        const { data: userRecord } = await getPublicUser()

        if (userRecord) {
          setAuthState(prev => ({
            ...prev,
            user: userRecord
          }))
        }
      } catch (error) {
        console.error('Error checking impersonation:', error)
      }
    }

    checkImpersonation()
  }, [])

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
          ...defaultImpersonationState
        })

        // Only clear cookie if it exists (active impersonation)
        if (cookieState?.isImpersonating) {
          setCookieState(defaultImpersonationState)
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startImpersonation = async (usersRecord: Database['public']['Tables']['users']['Row'][], userId: string) => {
    const permissions = await getUserPermissions()

    if (!permissions?.includes('impersonate_users')) {
      throw new Error('You do not have permission to impersonate users')
    }

    try {
      const impersonatedUser = usersRecord.find(user => user.user_id === userId)

      if (!impersonatedUser) {
        throw new Error('Failed to find user to impersonate')
      }

      const newState: ImpersonationState = {
        isImpersonating: true,
        originalUser: authState.user,
        impersonatedUser
      }

      setAuthState(prev => ({
        ...prev,
        ...newState
      }))

      // Create cookie only when starting impersonation
      setCookieState(newState)

      await impersonateUser(userId)
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
      setAuthState(prev => ({
        ...prev,
        ...defaultImpersonationState
      }))

      // Remove cookie when stopping impersonation
      setCookieState(defaultImpersonationState)

      await stopImpersonatingUser()
    } catch (error) {
      console.error('Error stopping impersonation:', error)
      throw error
    }
  }

  return {
    user: authState.isImpersonating ? authState.impersonatedUser : authState.user,
    isImpersonating: authState.isImpersonating,
    originalUser: authState.originalUser,
    impersonatedUser: authState.impersonatedUser,
    startImpersonation,
    stopImpersonation,
    isInitialized
  }
}
