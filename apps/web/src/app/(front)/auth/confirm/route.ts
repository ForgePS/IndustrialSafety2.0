// Next Imports
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

// Third-party Imports
import type { EmailOtpType } from '@supabase/supabase-js'

// Util Imports
import { createClient } from '@repo/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const redirect_to = searchParams.get('redirect_to') ?? '/'

  if (token_hash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash
    })

    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(redirect_to)
    }
  }

  // redirect the user to an error page with some instructions
  redirect('/auth/error')
}
