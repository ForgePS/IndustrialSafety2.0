import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runReportScheduleCron } from '@/lib/forgeSavedReports'

export const dynamic = 'force-dynamic'

/**
 * Port slice 13: sends scheduled reports that are due. Called by the platform scheduler with
 * `Authorization: Bearer $FORGE_CRON_SECRET` (same as /api/documents/cron), ideally every 15 minutes so schedules
 * go out close to their hour. Each due schedule is claimed before it is sent, so overlapping calls never send
 * twice. Notices go into the shared notification outbox; /api/helpdesk/cron sends the emails.
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

  return NextResponse.json({ ok: true, ...(await runReportScheduleCron()) })
}

export const GET = run
export const POST = run
