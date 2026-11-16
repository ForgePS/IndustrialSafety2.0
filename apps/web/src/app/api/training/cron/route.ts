import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runTrainingCron } from '@/lib/forgeTrainingNotify'

export const dynamic = 'force-dynamic'

/**
 * Hourly training job, called by the platform scheduler with `Authorization: Bearer $FORGE_CRON_SECRET`
 * (same pattern as /api/workers-comp/cron). For each organization it:
 * - runs automatic retraining once a day when the organization turned it on
 * - queues due-soon, overdue and expiring-certification notices (each one sends once)
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

  return NextResponse.json({ ok: true, ...(await runTrainingCron()) })
}

export const GET = run
export const POST = run
