'use server'

// Next Imports
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Third-party Imports
import { createClient, createServiceRoleClient } from '@repo/supabase/server'

// Var
const IMPERSONATOR_SESSION_COOKIE = 'impersonator_session'
const IMPERSONATION_STATE_COOKIE = 'impersonation_state'

export async function impersonateUser(user_id: string) {
  const supabase = await createClient()
  const supabaseServiceRole = createServiceRoleClient()

  // Get current admin's session to store it
  const {
    data: { session: adminSession }
  } = await supabase.auth.refreshSession()

  if (!adminSession) {
    throw new Error('No admin session found')
  }

  // Store admin's session in cookie
  const cookieStore = await cookies()

  cookieStore.set(
    IMPERSONATOR_SESSION_COOKIE,
    JSON.stringify({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token
    })
  )

  // Get the user from auth.users
  const {
    data: { user },
    error
  } = await supabaseServiceRole.auth.admin.getUserById(user_id)

  if (error || !user) {
    throw new Error(`Failed to get user for impersonation: ${error?.message}`)
  }

  // Generate a magic link for the impersonated user
  const { data: generateLinkData, error: generateLinkError } = await supabaseServiceRole.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email || ''
  })

  if (generateLinkError || !generateLinkData) {
    throw new Error(`Failed to generate link: ${generateLinkError?.message}`)
  }

  // Verify the magic link
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email: user.email || '',
    token: generateLinkData?.properties?.email_otp || '',
    type: 'email'
  })

  if (verifyError || !verifyData.session) {
    throw new Error(`Failed to verify OTP: ${verifyError?.message}`)
  }

  // Set the impersonated user's session
  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token
  })

  if (setSessionError) {
    throw new Error(`Failed to set session: ${setSessionError?.message}`)
  }

  redirect('/')
}

export async function stopImpersonatingUser() {
  const cookieStore = await cookies()
  const supabase = await createClient()

  const impersonatorSessionCookie = cookieStore.get(IMPERSONATOR_SESSION_COOKIE)
  const session = JSON.parse(impersonatorSessionCookie?.value as string)

  // Set the admin's session
  await supabase.auth.setSession({
    access_token: session?.access_token as string,
    refresh_token: session?.refresh_token as string
  })

  // Delete the impersonator session cookie
  cookieStore.delete(IMPERSONATOR_SESSION_COOKIE)
  cookieStore.delete(IMPERSONATION_STATE_COOKIE)

  redirect('/admin/users')
}

export async function deleteImpersonationCookies() {
  const cookieStore = await cookies()

  cookieStore.delete(IMPERSONATOR_SESSION_COOKIE)
  cookieStore.delete(IMPERSONATION_STATE_COOKIE)
}

export async function deletePaymentCookies() {
  const cookieStore = await cookies()

  cookieStore.delete('checkoutData')
}
