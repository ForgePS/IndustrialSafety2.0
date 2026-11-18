import { createClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

import type { PlatformUser } from './identityTypes'

export type { PlatformUser } from './identityTypes'

/**
 * Who is signed in, for 2.0 server code. Pages, actions and routes ask here instead of calling
 * Supabase Auth, so running inside 1.0 swaps this driver for one that verifies 1.0's Cognito
 * session (docs/INTEGRATION_2X_INTO_1X_PLAN.md, phase 1). Sign-in, sign-up and sign-out screens
 * are not covered: inside 1.0 those belong to 1.0.
 */
export interface IdentityDriver {

  /** The signed-in user, after full verification. Null when signed out or the session is invalid. */
  currentUser(): Promise<PlatformUser | null>

  /**
   * The signed-in user's id, or null, for public pages that only want to know whether someone is
   * signed in. Never throws.
   */
  optionalUserId(): Promise<string | null>
}

const toPlatformUser = (user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): PlatformUser | null =>
  user ? { id: user.id, email: user.email ?? null, user_metadata: (user.user_metadata || {}) as PlatformUser['user_metadata'] } : null

const supabaseDriver: IdentityDriver = {
  async currentUser() {
    const { data } = await getAuthUser()

    return toPlatformUser(data?.user)
  },

  async optionalUserId() {
    try {
      const { data } = await (await createClient()).auth.getUser()

      return data.user?.id || null
    } catch {
      return null
    }
  }
}

const drivers: Record<string, IdentityDriver> = { supabase: supabaseDriver }

const driver = (): IdentityDriver => {
  const name = process.env.FORGE_AUTH_PROVIDER || 'supabase'
  const selected = drivers[name]

  if (!selected) throw new Error(`Unknown FORGE_AUTH_PROVIDER "${name}".`)

  return selected
}

export const currentUser = () => driver().currentUser()

export const optionalUserId = () => driver().optionalUserId()
