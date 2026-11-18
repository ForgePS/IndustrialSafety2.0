import { cookies } from 'next/headers'

import { createClient, createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

import { fetchPlatformProfile, readBoundToken, verifyAccessToken } from './cognito'
import type { PlatformUser } from './identityTypes'

export type { PlatformUser } from './identityTypes'

/**
 * Who is signed in, for 2.0 server code. Pages, actions and routes ask here instead of calling
 * Supabase Auth. Two drivers, chosen by FORGE_AUTH_PROVIDER:
 *
 * - `supabase` (default): Supabase Auth, as 2.0 runs on its own.
 * - `cognito`: inside 1.0. The middleware keeps a verified Cognito access token in 2.0's cookie
 *   (lib/platform/cognitoMiddleware.ts); this driver verifies it again and maps the Cognito subject
 *   to a 2.0 user through public.forge_identity_links.
 *
 * Sign-in, sign-up and sign-out screens are not covered: inside 1.0 those belong to 1.0.
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

// Subject -> 2.0 user, kept briefly so each request does not query the link table.
const LINK_TTL_MS = 5 * 60 * 1000
const linked = new Map<string, { user: PlatformUser; at: number }>()

const directoryUser = async (userId: string): Promise<PlatformUser> => {
  const { data } = await createServiceRoleClient().from('users').select('name, email').eq('user_id', userId).maybeSingle()

  return { id: userId, email: data?.email ?? null, user_metadata: { name: data?.name ?? null, email: data?.email ?? null } }
}

/** The 2.0 user for a verified Cognito subject, linking (or creating) them on first use. */
export const resolveCognitoUser = async (subject: string, accessToken: string): Promise<PlatformUser | null> => {
  const cached = linked.get(subject)

  if (cached && Date.now() - cached.at < LINK_TTL_MS) return cached.user

  const db = createServiceRoleClient()
  const { data: link, error: linkError } = await db.from('forge_identity_links').select('user_id').eq('provider', 'cognito').eq('subject', subject).maybeSingle()

  if (linkError) {
    console.error('[identity] link lookup failed', linkError.code)

    return null
  }

  let userId = link?.user_id as string | undefined

  if (!userId) {
    const profile = await fetchPlatformProfile(accessToken)

    if (!profile?.email) {
      console.error('[identity] 1.0 profile unavailable; cannot link a new Cognito user')

      return null
    }

    const { data, error } = await db.rpc('forge_identity_link_user', {
      p_provider: 'cognito',
      p_subject: subject,
      p_email: profile.email,
      p_name: profile.name
    })

    if (error || !data) {
      console.error('[identity] linking failed', error?.code)

      return null
    }

    userId = data as string
  }

  const user = await directoryUser(userId)

  linked.set(subject, { user, at: Date.now() })

  return user
}

const cognitoDriver: IdentityDriver = {
  async currentUser() {
    // Signed out in 1.0 means signed out here, and a token counts only for the 1.0 session it was
    // exchanged for (see readBoundToken), whatever 2.0's cookie still holds.
    const { token } = await readBoundToken(await cookies())
    const claims = token ? await verifyAccessToken(token) : null

    return claims && token ? resolveCognitoUser(claims.sub, token) : null
  },

  async optionalUserId() {
    try {
      return (await cognitoDriver.currentUser())?.id ?? null
    } catch {
      return null
    }
  }
}

const drivers: Record<string, IdentityDriver> = { supabase: supabaseDriver, cognito: cognitoDriver }

const driver = (): IdentityDriver => {
  const name = process.env.FORGE_AUTH_PROVIDER || 'supabase'
  const selected = drivers[name]

  if (!selected) throw new Error(`Unknown FORGE_AUTH_PROVIDER "${name}".`)

  return selected
}

export const currentUser = () => driver().currentUser()

export const optionalUserId = () => driver().optionalUserId()
