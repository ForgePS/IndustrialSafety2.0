import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runForkliftCron } from '@/lib/forgeForkliftNotify'

export const dynamic = 'force-dynamic'

/**
 * Forklift operator reminders, called by the platform scheduler (daily is enough) with `Authorization: Bearer
 * $FORGE_CRON_SECRET` (same pattern as /api/permits/cron). For each organization with forklifts it tells the people
 * who authorize operators at the operator's location (and the operator, for "expiring") about authorizations due
 * for re-evaluation within the company's reminder window and ones that have expired. Each notice goes once per
 * operator, kind and expiry date (forge_forklift_notice_log).
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

  return NextResponse.json({ ok: true, ...(await runForkliftCron()) })
}

export const GET = run
export const POST = run
