import { createServiceRoleClient } from '@repo/supabase/server'

import { getBodyMapCardData } from '@/lib/forgeBodyMap'
import { getScopedCorrectiveActions } from '@/lib/forgeCorrectiveActions'
import { pendingAcknowledgments } from '@/lib/forgeDocumentAccess'
import { getScopedCompanyDrivers, getScopedDotRecords, getScopedDriverFiles } from '@/lib/forgeDot'
import { buildDotAttentionCards, dotDueOverdueLabel } from '@/lib/forgeDotRules'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import type { EffectiveExperienceElement } from '@/lib/forgeExperience'
import { covers as forkliftCovers, forkliftRights, listOperators } from '@/lib/forgeForkliftAccess'
import { matchesStanding, operatorStandings } from '@/lib/forgeForkliftOperators'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getScopedLockouts, getScopedLotoProcedures } from '@/lib/forgeLoto'
import { lotoReviewOverdue } from '@/lib/forgeLotoRules'
import { listObservations } from '@/lib/forgeObservations'
import { getScopedOshaCases } from '@/lib/forgeOsha'
import { covers, listPermits, permitRights } from '@/lib/forgePermitAccess'
import { OPEN_STATUSES } from '@/lib/forgePermitRules'
import { getScopedTasks } from '@/lib/forgeTasks'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { trainingTodayIso } from '@/lib/forgeTrainingLms'
import { assignmentOverdue } from '@/lib/forgeTrainingManageRules'
import { getScopedWcCases } from '@/lib/forgeWorkersComp'
import {
  SAFETY_PERIODS,
  addDaysIso,
  computeSafetyIndex,
  countByLabel,
  incidentTrend,
  incidentYearComparison,
  injuryHistory,
  normalizeDashboardLayout,
  safetyGrade,
  sortAttention,
  taskSchedule,
  tasksDue,
  trainingRenewals,
  type AttentionItem,
  type DashboardLayout,
  type SafetyPeriod
} from '@/lib/forgeDashboardRules'

/**
 * Home dashboard data (port of 1.0 `dashboard()` and industrial-dashboard). Every source is read through its
 * module's scoped loader with the viewer's own view permission, so a count never includes a record the viewer
 * could not open. A source that fails is logged and left out; it never breaks the page.
 */

type Access = { effective: EffectivePermission[] }

const allowed = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

const quietly = async <T>(label: string, load: () => Promise<T>): Promise<T | null> => {
  try {
    return await load()
  } catch (error) {
    console.error(`Dashboard: ${label} failed`, error)

    return null
  }
}

const day = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : '')

export const getDashboardLayout = async ({ organizationId, userId }: { organizationId: string; userId: string }): Promise<DashboardLayout> => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase.from('forge_dashboard_layouts').select('layout').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle()

  return normalizeDashboardLayout(data?.layout)
}

export type QuickAction = { key: string; label: string; href: string }

export type SafetyIndexPeriod = { period: SafetyPeriod; label: string; score: number; grade: string; openIncidents: number; totalIncidents: number; inspections: number; training: number }

export type DashboardData = {
  todayIso: string
  attention: AttentionItem[] | null
  quickActions: QuickAction[]
  tasksDue: Array<{ id: string; title: string; status: string; due_at: string | null; priority: string | null; overdue: boolean }> | null
  taskScheduler: ReturnType<typeof taskSchedule> | null
  safetyIndex: { periods: SafetyIndexPeriod[]; dotCompliance: number | null } | null
  incidentTrend: ReturnType<typeof incidentTrend> | null
  incidentYears: ReturnType<typeof incidentYearComparison> | null
  injuryHistory: ReturnType<typeof injuryHistory> | null
  inspectionsBySite: Array<{ label: string; count: number }> | null
  bodyMap: Awaited<ReturnType<typeof getBodyMapCardData>>
  workspace: EffectiveExperienceElement[]
}

export const getDashboardData = async ({
  organizationId,
  userId,
  access,
  modules
}: {
  organizationId: string
  userId: string
  access: Access
  modules: EffectiveExperienceElement[]
}): Promise<DashboardData> => {
  const todayIso = trainingTodayIso()

  const scope = (key: string) => {
    const permission = allowed(access, key)

    return permission ? { organizationId, userId, permission } : null
  }

  const incidentsScope = scope('incidents.view')
  const tasksScope = scope('tasks.view')
  const actionsScope = scope('corrective_actions.view')
  const inspectionsScope = scope('inspections.view')
  const observationsScope = scope('observations.view')
  const trainingScope = scope('training.view')
  const lotoScope = scope('loto.view')
  const wcScope = scope('workers_comp.view')
  const dotScope = scope('dot.view')
  const oshaScope = scope('osha.view')
  const year = Number(todayIso.slice(0, 4))

  const [incidents, tasks, actions, inspections, observations, training, procedures, lockouts, wcCases, dot, oshaCases, bodyMap] = await Promise.all([
    incidentsScope ? quietly('incidents', () => getScopedIncidents(incidentsScope)) : null,
    tasksScope ? quietly('tasks', () => getScopedTasks(tasksScope)) : null,
    actionsScope ? quietly('corrective actions', () => getScopedCorrectiveActions(actionsScope)) : null,
    inspectionsScope ? quietly('inspections', () => getScopedInspections(inspectionsScope)) : null,
    observationsScope ? quietly('observations', () => listObservations(observationsScope)) : null,
    trainingScope ? quietly('training', () => getTrainingOverview(trainingScope)) : null,
    lotoScope ? quietly('loto procedures', () => getScopedLotoProcedures(lotoScope)) : null,
    lotoScope ? quietly('lockouts', () => getScopedLockouts({ ...lotoScope, view: 'open' })) : null,
    wcScope ? quietly('workers comp', () => getScopedWcCases(wcScope)) : null,
    dotScope
      ? quietly('dot', async () => {
          const [files, drivers, records] = await Promise.all([getScopedDriverFiles({ ...dotScope, todayIso }), getScopedCompanyDrivers(dotScope), getScopedDotRecords(dotScope)])

          return { files, drivers, records }
        })
      : null,
    oshaScope
      ? quietly('osha', async () => (await Promise.all(Array.from({ length: 5 }, (_, index) => getScopedOshaCases({ ...oshaScope, year: year - index })))).flat())
      : null,
    quietly('body map', () => getBodyMapCardData({ organizationId, userId, access }))
  ])

  const attention: AttentionItem[] = []

  if (incidents) {
    attention.push({ key: 'incidents-review', label: 'Incidents awaiting review', count: incidents.filter((item: any) => item.status === 'submitted').length, href: '/incidents', tone: 'warning' })
    attention.push({ key: 'incidents-returned', label: 'Incidents returned for changes', count: incidents.filter((item: any) => item.status === 'returned').length, href: '/incidents', tone: 'info' })
  }

  if (actions) {
    const open = actions.filter((item: any) => ['open', 'in_progress', 'pending_verification'].includes(item.status))
    const overdue = open.filter((item: any) => day(item.due_at) && day(item.due_at) < todayIso).length

    attention.push({ key: 'actions-overdue', label: 'Corrective actions overdue', count: overdue, href: '/corrective-actions', tone: 'danger' })
    attention.push({
      key: 'actions-verify',
      label: 'Corrective actions to verify',
      count: open.filter((item: any) => item.status === 'pending_verification').length,
      href: '/corrective-actions',
      tone: 'warning'
    })
  }

  if (inspections) {
    attention.push({
      key: 'inspections-open',
      label: 'Inspections in progress',
      count: inspections.filter((item: any) => ['draft', 'in_progress', 'returned'].includes(item.status)).length,
      href: '/inspections',
      tone: 'info'
    })
    attention.push({ key: 'inspections-review', label: 'Inspections awaiting approval', count: inspections.filter((item: any) => item.status === 'submitted').length, href: '/inspections', tone: 'warning' })
  }

  if (observations) {
    attention.push({
      key: 'observations-review',
      label: 'Observations to review',
      count: observations.filter((item: any) => ['submitted', 'review'].includes(item.status)).length,
      href: '/observations',
      tone: 'warning'
    })
    attention.push({ key: 'observations-action', label: 'Observations needing action', count: observations.filter((item: any) => item.status === 'action_required').length, href: '/observations', tone: 'danger' })
  }

  if (tasks) {
    const mine = tasks.filter((item: any) => item.assigned_user_id === userId && ['open', 'in_progress', 'blocked'].includes(item.status))

    attention.push({ key: 'tasks-mine', label: 'My open tasks', count: mine.length, detail: `${mine.filter((item: any) => day(item.due_at) && day(item.due_at) < todayIso).length} overdue`, href: '/tasks', tone: 'primary' })
  }

  if (training) {
    const assignments = training.assignments as Array<{ status: string; due_date: string | null }>

    attention.push({ key: 'training-overdue', label: 'Training overdue', count: assignments.filter(item => assignmentOverdue(item, todayIso)).length, href: '/training?status=overdue', tone: 'danger' })

    const { expiring, expired } = trainingRenewals(training.completions as any[], todayIso, 30)

    attention.push({ key: 'training-renewals', label: 'Certifications expiring in 30 days', count: expiring, detail: expired ? `${expired} expired` : undefined, href: '/training/reports', tone: 'warning' })
  }

  if (procedures) {
    attention.push({ key: 'loto-review', label: 'LOTO procedures past review', count: procedures.filter((item: any) => lotoReviewOverdue(item, todayIso)).length, href: '/loto?status=approved', tone: 'warning' })
    attention.push({ key: 'loto-review-queue', label: 'LOTO procedures in review', count: procedures.filter((item: any) => item.status === 'review').length, href: '/loto?status=review', tone: 'info' })
  }

  if (lockouts) attention.push({ key: 'loto-open', label: 'Open lockouts', count: lockouts.length, href: '/loto/lockouts', tone: 'info' })

  if (wcCases) {
    const active = wcCases.filter((item: any) => item.status === 'active')

    attention.push({ key: 'wc-active', label: "Active workers' comp cases", count: active.length, href: '/workers-comp', tone: 'info' })
    attention.push({
      key: 'wc-next-action',
      label: "Workers' comp next actions overdue",
      count: active.filter((item: any) => day(item.next_action_due) && day(item.next_action_due) < todayIso).length,
      href: '/workers-comp',
      tone: 'danger'
    })
  }

  let dotCompliance: number | null = null

  if (dot) {
    const cards = buildDotAttentionCards(dot.files, dot.drivers)
    const fileFollowUps = dot.files.filter(file => file.issues.some(issue => cards.some(card => card.source === 'dqf' && card.kind === issue.kind))).length
    const rosterFollowUps = dot.drivers.filter((driver: any) => driver.issues.some((issue: any) => cards.some(card => card.source === 'roster' && card.kind === issue.kind))).length

    attention.push({ key: 'dot-files', label: 'Driver files needing follow-up', count: fileFollowUps, href: '/dot', tone: 'warning' })
    attention.push({ key: 'dot-roster', label: 'Company drivers needing follow-up', count: rosterFollowUps, href: '/dot/company-drivers', tone: 'info' })
    attention.push({
      key: 'dot-records',
      label: 'DOT records overdue',
      count: dot.records.filter((record: any) => dotDueOverdueLabel(record, todayIso)?.overdue).length,
      href: '/dot/records',
      tone: 'danger'
    })

    const compliant = dot.files.filter(file => !file.issues.some(issue => issue.kind !== 'expiring')).length

    dotCompliance = dot.files.length ? Math.round((compliant / dot.files.length) * 100) : null
  }

  // Port slice 12: published documents distributed to the viewer that they still need to acknowledge.
  if (allowed(access, 'documents.view')) {
    const toRead = await quietly('documents to read', async () => (await pendingAcknowledgments(organizationId, userId)).length)

    if (toRead !== null) attention.push({ key: 'documents-to-read', label: 'Documents to read', count: toRead, href: '/documents/acknowledgments', tone: 'primary' })
  }

  // Port slice 18: permits waiting for the viewer's approval, and open permits past their end time at the
  // locations they approve for.
  if (allowed(access, 'permits.approve')) {
    const permits = await quietly('permits', async () => {
      const rights = await permitRights(organizationId, userId, access)
      const rows = await listPermits({ organizationId, rights, open: true })
      const now = Date.now()
      const approvable = rows.filter((row: any) => covers(rights.approve, row.location_id))

      return {
        waiting: approvable.filter((row: any) => row.status === 'requested' && row.requested_by !== userId).length,
        expired: approvable.filter((row: any) => OPEN_STATUSES.includes(row.status) && new Date(row.valid_until).getTime() <= now).length
      }
    })

    if (permits) {
      attention.push({ key: 'permits-waiting', label: 'Permits waiting for your approval', count: permits.waiting, href: '/permits', tone: 'warning' })
      attention.push({ key: 'permits-expired', label: 'Open permits past their end time', count: permits.expired, href: '/permits', tone: 'danger' })
    }
  }

  // Port slice 19: forklift operators the viewer authorizes whose evaluation has expired, is due within the reminder
  // window, or who need refresher training.
  if (allowed(access, 'forklifts.authorize')) {
    const due = await quietly('forklift operators', async () => {
      const rights = await forkliftRights(organizationId, userId, access)
      const operators = (await listOperators({ organizationId, rights })).filter(operator => forkliftCovers(rights.authorize, operator.person.locationId))
      const { standings } = await operatorStandings(organizationId, operators)

      return operators.filter(operator => matchesStanding(standings.get(operator.id) || 'none', 'due')).length
    })

    if (due !== null) attention.push({ key: 'forklift-operators-due', label: 'Forklift operators due for re-evaluation', count: due, href: '/forklifts/operators?standing=due', tone: 'warning' })
  }

  if (oshaScope && incidents) {
    const awaiting = await quietly('osha awaiting', async () => {
      const injuries = incidents.filter(
        (item: any) => item.status !== 'draft' && day(item.occurred_at).startsWith(`${year}-`) && (item.involves_injury || item.incident_type === 'injury' || item.osha_review_flag)
      )

      if (!injuries.length) return 0

      const supabase = createServiceRoleClient() as any

      const { data } = await supabase
        .from('forge_osha_cases')
        .select('incident_id')
        .eq('organization_id', organizationId)
        .neq('status', 'voided')
        .in(
          'incident_id',
          injuries.map((item: any) => item.id)
        )

      const decided = new Set((data || []).map((row: any) => row.incident_id))

      return injuries.filter((item: any) => !decided.has(item.id)).length
    })

    if (awaiting !== null) attention.push({ key: 'osha-awaiting', label: 'Injuries awaiting an OSHA decision', count: awaiting, href: '/osha', tone: 'warning' })
  }

  const quickActions: QuickAction[] = [
    allowed(access, 'incidents.create') && { key: 'incident', label: 'Report Incident', href: '/incidents/create' },
    allowed(access, 'observations.create') && { key: 'observation', label: 'New Observation', href: '/observations/create' },
    allowed(access, 'inspections.create') && { key: 'inspection', label: 'Start Inspection', href: '/inspections/create' },
    allowed(access, 'tasks.create') && { key: 'task', label: 'New Task', href: '/tasks/create' }
  ].filter((item): item is QuickAction => Boolean(item))

  // Safety index (1.0): incidents, inspections and training completed in the period.
  let safetyIndex: DashboardData['safetyIndex'] = null

  if (incidents || inspections || training || dotCompliance !== null) {
    const periods = (Object.keys(SAFETY_PERIODS) as SafetyPeriod[]).map(period => {
      const from = addDaysIso(todayIso, -SAFETY_PERIODS[period].days)
      const inPeriod = (value: string | null | undefined) => day(value) >= from && day(value) <= todayIso
      const periodIncidents = (incidents || []).filter((item: any) => item.status !== 'draft' && inPeriod(item.occurred_at))
      const openIncidents = periodIncidents.filter((item: any) => item.status !== 'closed').length
      const inspectionCount = (inspections || []).filter((item: any) => item.status !== 'draft' && inPeriod(item.inspection_date || item.created_at)).length
      const trainingCount = (training?.completions || []).filter((item: any) => inPeriod(item.completed_at)).length
      const score = computeSafetyIndex({ openIncidents, totalIncidents: periodIncidents.length, inspectionCount, trainingCount })

      return {
        period,
        label: SAFETY_PERIODS[period].label,
        score,
        grade: safetyGrade(score),
        openIncidents,
        totalIncidents: periodIncidents.length,
        inspections: inspectionCount,
        training: trainingCount
      }
    })

    safetyIndex = { periods, dotCompliance }
  }

  const twelveMonthsAgo = addDaysIso(todayIso, -365)

  return {
    todayIso,
    attention: attention.length ? sortAttention(attention) : null,
    quickActions,
    tasksDue: tasks
      ? tasksDue(
          tasks
            .filter((item: any) => item.assigned_user_id === userId)
            .map((item: any) => ({ id: item.id, title: item.title || item.task_number, status: item.status, due_at: item.due_at, priority: item.priority || null })),
          todayIso
        )
      : null,
    taskScheduler: tasks ? taskSchedule(tasks as any[], todayIso) : null,
    safetyIndex,
    incidentTrend: incidents ? incidentTrend(incidents as any[], todayIso) : null,
    incidentYears: incidents ? incidentYearComparison(incidents as any[], todayIso, 5) : null,
    injuryHistory: incidents || oshaCases ? injuryHistory({ incidents: (incidents || []) as any[], oshaCases: (oshaCases as any[]) || null, todayIso }) : null,
    inspectionsBySite: inspections
      ? countByLabel(inspections.filter((item: any) => item.status !== 'draft' && day(item.inspection_date || item.created_at) >= twelveMonthsAgo).map((item: any) => item.locations?.name)).slice(0, 12)
      : null,
    bodyMap,
    workspace: modules
  }
}
