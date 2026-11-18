import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runDocumentCron } from '@/lib/forgeDocumentNotify'

export const dynamic = 'force-dynamic'

/**
 * Daily document review reminders, called by the platform scheduler with `Authorization: Bearer
 * $FORGE_CRON_SECRET` (same pattern as /api/fleet/cron). For each organization with Document Control it tells
 * the owner and the managers in scope about published documents whose review is due within the
 * review_warning_days setting or overdue (once per document, review date and kind).
 *
 * Notices go into the shared notification outbox; /api/helpdesk/cron sends the emails.
 */
const authorized = (request: Request) => {
  const secret = process.env.FORGE_CRON_SECRET

  if (!secret) return false

  const supplied = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from('Bearer ' + secret)

  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

const run = async (request: Request) => {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  return NextResponse.json({ ok: true, ...(await runDocumentCron()) })
}

export const GET = run
export const POST = run
