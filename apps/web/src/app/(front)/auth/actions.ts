'use server'

// Third-party Imports
import { createServiceRoleClient } from '@repo/supabase/server'

export const verifyEmail = async (email: string, emailRedirectTo?: string) => {
  const supabase = createServiceRoleClient()

  const response = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      ...(emailRedirectTo && { emailRedirectTo })
    }
  })

  return response
}
