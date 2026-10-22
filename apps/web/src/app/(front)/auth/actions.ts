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
