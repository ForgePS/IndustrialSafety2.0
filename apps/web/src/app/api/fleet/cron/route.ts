import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runFleetCron } from '@/lib/forgeFleetNotify'

export const dynamic = 'force-dynamic'

/**
 * Daily (or hourly) fleet reminder job, called by the platform scheduler with
 * `Authorization: Bearer $FORGE_CRON_SECRET` (same pattern as /api/training/cron). For each organization with
 * the Fleet feature it queues registration, insurance, annual inspection, maintenance, DVIR defect and
 * document reminders (each one sends once per person).
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

  return NextResponse.json({ ok: true, ...(await runFleetCron()) })
}

export const GET = run
export const POST = run
