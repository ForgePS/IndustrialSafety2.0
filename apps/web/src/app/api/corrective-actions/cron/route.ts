import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runCapaReminderSweep } from '@/lib/forgeCapaNotify'

export const dynamic = 'force-dynamic'

/**
 * Hourly Corrective Action job, called by the platform scheduler with `Authorization: Bearer $FORGE_CRON_SECRET`
 * (same pattern as /api/training/cron). It queues due-soon and overdue notices to CAPA assignees; each one sends
 * once per due date, so running it hourly is safe.
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

  const reminders = await runCapaReminderSweep()

  return NextResponse.json({ ok: !reminders.error, reminders }, { status: reminders.error ? 500 : 200 })
}

export const GET = run
export const POST = run
