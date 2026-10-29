import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@repo/supabase/server'

export const dynamic = 'force-dynamic'

const destinationFor = (targetId: string, action: string) => {
  if (action === 'maintenance') return '/assets/' + targetId + '/maintenance/create'
  if (action === 'meter_reading') return '/assets/' + targetId + '/meter-readings/create'
  return '/assets/' + targetId
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!/^[a-f0-9]{48}$/i.test(token)) {
    return NextResponse.redirect(new URL('/q/unavailable', request.url))
  }

  let authUserId: string | null = null

  try {
    const authClient = await createClient()
    const { data } = await authClient.auth.getUser()
    authUserId = data.user?.id || null
  } catch {
    authUserId = null
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('resolve_and_record_forge_qr_scan', {
    p_token: token,
    p_auth_user_id: authUserId,
    p_user_agent: request.headers.get('user-agent'),
    p_referrer: request.headers.get('referer')
  })

  const resolved = Array.isArray(data) ? data[0] : null

  if (error || !resolved) {
    return NextResponse.redirect(new URL('/q/unavailable', request.url))
  }

  const destinationPath = destinationFor(resolved.target_id, resolved.default_action)
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  return NextResponse.redirect(new URL(destinationPath, appOrigin))
}
