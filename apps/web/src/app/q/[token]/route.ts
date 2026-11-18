import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { optionalUserId } from '@/lib/platform/identity'

export const dynamic = 'force-dynamic'

const destinationFor = (token: string, targetType: string, targetId: string, action: string) => {
  // Port slice 10: the scan action menu (also every location and form QR). The scan page logs the open.
  if (action === 'scan_menu' || targetType !== 'asset') return '/scan/' + token.toLowerCase()
  if (action === 'maintenance') return '/assets/' + targetId + '/maintenance/create'
  if (action === 'meter_reading') return '/assets/' + targetId + '/meter-readings/create'

  // Public, read-only LOTO view (as in 1.0). The page re-checks the token.
  if (action === 'loto_view') return '/q/' + token + '/loto'

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

  const authUserId = await optionalUserId()

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

  const destinationPath = destinationFor(token, resolved.target_type, resolved.target_id, resolved.default_action)
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  return NextResponse.redirect(new URL(destinationPath, appOrigin))
}
