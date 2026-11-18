import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { dispatchPendingEmails } from '@/lib/forgeNotifications'
import { jsonError } from '@/lib/forgeHelpdeskHttp'

export const dynamic = 'force-dynamic'

const authorized = (request: Request) => {
  const secret = process.env.HELPDESK_CRON_SECRET || ''
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (secret.length < 24 || token.length !== secret.length) return false

  return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
}

// Scheduled job: SLA evaluation (at-risk/breach notifications) and the email outbox.
async function run(request: Request) {
  if (!authorized(request)) return jsonError('Unauthorized.', 401)
  const db = createServiceRoleClient() as any
  const { data: sla, error } = await db.rpc('forge_support_evaluate_sla', {})

  if (error) {
    console.error('[helpdesk] cron SLA evaluation', error.message)

    return jsonError('SLA evaluation failed.', 500)
  }

  const email = await dispatchPendingEmails({ limit: 100 })

  return NextResponse.json({ ok: true, sla, email })
}

export const GET = run
export const POST = run
