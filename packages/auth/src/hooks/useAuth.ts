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
        // First check if we have an active session
        const {
          data: { session }
        } = await supabase.auth.getSession()

        if (!session?.user) {
          return
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let mounted = true
    const broadcastChannel = typeof window !== 'undefined' ? new BroadcastChannel('auth_state_channel') : null

    // Function to update auth state
    const updateAuthState = async (session: any) => {
      if (!mounted) return

      if (session?.user) {
        try {
          const { data: userRecord, error } = await getPublicUser()

          if (error) {
            console.error('Error fetching user data:', error)

            return
          }

          if (userRecord && mounted) {
            setAuthState(prev => ({
              ...prev,
              user: userRecord
            }))

            broadcastChannel?.postMessage({
              type: 'AUTH_STATE_CHANGE',
              user: userRecord,
              timestamp: Date.now()
            })
          }
        } catch (error) {
          console.error('Error fetching user data:', error)
        }
      } else {
        if (mounted) {
          setAuthState({
            user: null,
            ...defaultImpersonationState
          })

          // Only clear cookie if it exists (active impersonation)
          if (cookieState?.isImpersonating) {
            setCookieState(defaultImpersonationState)
          }

          broadcastChannel?.postMessage({
            type: 'AUTH_STATE_CHANGE',
            user: null,
            timestamp: Date.now()
          })
        }
      }
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateAuthState(session)
    })

    // Set up auth state change listener
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      updateAuthState(session)
    })

    // Listen for auth state changes from other tabs
    if (broadcastChannel) {
      let lastProcessedTimestamp = 0

      broadcastChannel.onmessage = event => {
        // Prevent processing duplicate or old messages
        if (event.data.timestamp <= lastProcessedTimestamp) return
        lastProcessedTimestamp = event.data.timestamp

        if (event.data.type === 'AUTH_STATE_CHANGE' && mounted) {
          setAuthState(prev => ({
            ...prev,
            user: event.data.user,
            ...(event.data.user ? {} : defaultImpersonationState)
          }))
        }
      }
    }

    // Cleanup function
    return () => {
      mounted = false
      subscription?.unsubscribe()
      broadcastChannel?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Separate effect for session recovery
  useEffect(() => {
    const recoverSession = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession()

        if (session?.user && !authState.user) {
          const { data: userRecord } = await getPublicUser()

          if (userRecord) {
            setAuthState(prev => ({
              ...prev,
              user: userRecord
            }))
          }
        }
      } catch (error) {
        console.error('Error recovering session:', error)
      }
    }

    recoverSession()
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
      // Ignore NEXT_REDIRECT error as it's expected behavior
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        return
      }

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
      // Ignore NEXT_REDIRECT error as it's expected behavior
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        return
      }

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
