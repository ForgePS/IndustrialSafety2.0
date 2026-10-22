'use server'

// Third-party Imports
import { createServiceRoleClient } from '@repo/supabase/server'

/**
 * Resends the sign-up confirmation email.
 *
 * The result never says whether the address is registered or already verified (that would let anyone
 * probe which emails have accounts). Only rate limiting is reported, so the visitor knows to wait.
 */
export const verifyEmail = async (email: string, emailRedirectTo?: string): Promise<{ error: { message: string } | null }> => {
  const supabase = createServiceRoleClient()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      ...(emailRedirectTo && { emailRedirectTo })
    }
  })

  if (!error) return { error: null }

  if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
    return { error: { message: 'Too many requests. Please wait a minute and try again.' } }
  }

  console.error('[auth] resend verification failed:', error.code || error.status, error.message)

  return { error: null }
}

/**
 * True when the typed email already has an account that is still waiting for email confirmation.
 *
 * Supabase `signUp` reports success for such an email (and resends the confirmation) without changing
 * its password, so sign-up flows must send the visitor to email verification instead. Answers for one
 * address only; no user list ever reaches the browser.
 */
export const hasUnconfirmedAccount = async (email: string): Promise<boolean> => {
  const address = String(email || '').trim()

  if (!address || address.length > 320) return false

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('forge_auth_email_state', { p_email: address })

  if (error) {
    console.error('[auth] email state lookup failed:', error.code, error.message)

    return false
  }

  return data === 'unconfirmed'
}
