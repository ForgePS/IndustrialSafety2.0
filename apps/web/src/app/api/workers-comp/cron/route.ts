import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { refreshWcOshaDayCounts } from '@/lib/forgeWorkersComp'

export const dynamic = 'force-dynamic'

/**
 * Nightly workers' comp job, called by the platform scheduler with `Authorization: Bearer $FORGE_CRON_SECRET`
 * (same pattern as /api/forge-ai/watch/cron). Keeps OSHA day counts current for open claims.
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

  return NextResponse.json({ ok: true, oshaRefresh })
}

export const GET = run
export const POST = run
