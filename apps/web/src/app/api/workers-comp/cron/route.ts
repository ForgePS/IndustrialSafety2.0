import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { refreshWcOshaDayCounts } from '@/lib/forgeWorkersComp'
import { queueDueWcWeeklyNotices } from '@/lib/forgeWorkersCompNotify'

export const dynamic = 'force-dynamic'

/**
 * Hourly workers' comp job, called by the platform scheduler with `Authorization: Bearer $FORGE_CRON_SECRET`
 * (same pattern as /api/forge-ai/watch/cron). It:
 * - keeps OSHA day counts current for open claims
 * - queues each tenant's weekly status notice when it is due in that tenant's time zone
 *
 * The notices go into the shared notification outbox. /api/helpdesk/cron drains it and sends the emails, so
 * only one job ever sends.
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

  const oshaRefresh = await refreshWcOshaDayCounts()
  const weeklyNotices = await queueDueWcWeeklyNotices()

  return NextResponse.json({ ok: true, oshaRefresh, weeklyNotices })
}

export const GET = run
export const POST = run
