import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess, type EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getReportDefinition, REPORTS, type ReportDefinition } from '@/lib/forgeReportCatalog'
import { cleanReportParams, runReportRules, visibleColumns, type ReportParams, type ReportResult } from '@/lib/forgeReportRules'

/**
 * Port slice 13: running a report for one person. Every run, whether on screen, an export or a scheduled
 * delivery, comes through here, so the same checks always apply:
 *
 * 1. reporting.view, and the report's own module permission (e.g. workers_comp.view). 1.0 let basic Industrial
 *    access through for every report.
 * 2. The module's scoped loader with that permission, so the rows follow the person's scope.
 * 3. Sensitive columns only with their permission, stripped before anything else sees the rows.
 *
 * Each run is recorded in forge_report_runs, including refusals and failures (1.0 only recorded successes).
 */

const db = () => createServiceRoleClient() as any

export const todayIso = () => new Date().toISOString().slice(0, 10)

export type ReportAccess = { effective: EffectivePermission[] }

export const reportAccessFor = async (organizationId: string, userId: string): Promise<ReportAccess> =>
  getEffectiveTenantAccess({ organizationId, userId })

export const grantOf = (access: ReportAccess, permissionKey: string) =>
  access.effective.find(item => item.permissionKey === permissionKey && item.allowed) || null

export const can = (access: ReportAccess, permissionKey: string) => Boolean(grantOf(access, permissionKey))

/** The reports this person may run: reporting.view plus each report's module permission. */
export const reportsFor = (access: ReportAccess) => (can(access, 'reporting.view') ? REPORTS.filter(report => can(access, report.permission)) : [])

export const reportFor = (access: ReportAccess, key: string) => {
  const report = getReportDefinition(key)

  return report && can(access, 'reporting.view') && can(access, report.permission) ? report : null
}

export type RunKind = 'view' | 'csv' | 'pdf' | 'scheduled'

export type ReportRun =
  | { ok: true; report: ReportDefinition; params: ReportParams; result: ReportResult }
  | { ok: false; reason: 'denied' | 'failed'; message: string }

const logRun = async (entry: {
  organizationId: string
  userId: string
  reportKey: string
  kind: RunKind
  params: ReportParams
  status: 'succeeded' | 'failed' | 'denied'
  rowCount?: number | null
  error?: string | null
  savedReportId?: string | null
  scheduleId?: string | null
}) => {
  const { error } = await db()
    .from('forge_report_runs')
    .insert({
      organization_id: entry.organizationId,
      user_id: entry.userId,
      report_key: entry.reportKey.slice(0, 120),
      saved_report_id: entry.savedReportId || null,
      schedule_id: entry.scheduleId || null,
      kind: entry.kind,
      params: entry.params,
      row_count: entry.rowCount ?? null,
      status: entry.status,
      error: entry.error ? entry.error.slice(0, 1000) : null
    })

  // History must never break a run.
  if (error) console.error('[reporting] run log', error.message)
}

/** Runs a report for a person with their own permissions. Never throws for a refusal or a failed load. */
export const runReport = async ({
  organizationId,
  userId,
  reportKey,
  rawParams,
  kind,
  access,
  savedReportId,
  scheduleId,
  today = todayIso()
}: {
  organizationId: string
  userId: string
  reportKey: string
  rawParams: Record<string, unknown>
  kind: RunKind
  access?: ReportAccess
  savedReportId?: string | null
  scheduleId?: string | null
  today?: string
}): Promise<ReportRun> => {
  const resolved = access || (await reportAccessFor(organizationId, userId))
  const report = reportFor(resolved, reportKey)
  const definition = getReportDefinition(reportKey)

  if (!report || !definition) {
    await logRun({ organizationId, userId, reportKey, kind, params: {}, status: 'denied', savedReportId, scheduleId })

    return { ok: false, reason: 'denied', message: "You don't have access to this report." }
  }

  const params = cleanReportParams(rawParams, report, today)
  const permission = grantOf(resolved, report.permission) as EffectivePermission

  try {
    const records = await report.load({ organizationId, userId, permission, params, today })
    const visible = visibleColumns(report.columns, key => can(resolved, key))
    const result = runReportRules({ records, meta: report, params, visible, today })

    await logRun({ organizationId, userId, reportKey, kind, params, status: 'succeeded', rowCount: result.total, savedReportId, scheduleId })

    return { ok: true, report, params, result }
  } catch (failure) {
    const message = (failure as Error).message || 'The report could not be run.'

    console.error('[reporting] run', reportKey, message)
    await logRun({ organizationId, userId, reportKey, kind, params, status: 'failed', error: message, savedReportId, scheduleId })

    return { ok: false, reason: 'failed', message: 'The report could not be run. Try again, or contact support if it keeps failing.' }
  }
}

/** Locations for the filter list. Names only; the rows themselves still follow each module's scope. */
export const reportLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).order('name')

  return ((data || []) as { id: string; name: string }[]).filter(location => location.name)
}

/** This person's recent runs, newest first. */
export const recentRuns = async (organizationId: string, userId: string, limit = 100) => {
  const { data, error } = await db()
    .from('forge_report_runs')
    .select('id, report_key, saved_report_id, schedule_id, kind, params, row_count, status, error, created_at, forge_saved_reports(name)')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('Unable to load report history: ' + error.message)

  return (data || []) as any[]
}
