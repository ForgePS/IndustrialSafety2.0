import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runPermitCron } from '@/lib/forgePermitNotify'

export const dynamic = 'force-dynamic'

/**
 * Work permit reminders, called by the platform scheduler every few minutes with `Authorization: Bearer
 * $FORGE_CRON_SECRET` (same pattern as /api/documents/cron). For each organization with work permits it tells the
 * requester and the approvers in scope about permits ending within the hour, permits past their end time that are
 * still open, hot work whose fire watch has finished, and confined spaces with people inside whose last gas test is
 * too old. Each notice goes once per permit, kind and window (forge_permit_notice_log).
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

  return NextResponse.json({ ok: true, ...(await runPermitCron()) })
}

export const GET = run
export const POST = run
