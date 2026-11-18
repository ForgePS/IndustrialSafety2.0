import { createServiceRoleClient } from '@repo/supabase/server'

import { assignGroupRequirements, trainingTodayIso } from '@/lib/forgeTrainingLms'
import { NOTICE_TEXT, addDaysToIso, assignmentReminder, expiringNoticeDue } from '@/lib/forgeTrainingReportRules'
import type { NoticeSettings } from '@/lib/forgeTrainingReportRules'

/**
 * Training notices through the shared notification service: in-app plus email (the outbox drain at
 * /api/helpdesk/cron sends the emails). Learners are told when training is assigned (1.0 did this), when it
 * is due soon or overdue, and when a certification is about to expire (both new in 2.0).
 * Only people with a Forge login get notices; the notice log makes each one send once.
 */

export type TrainingNoticeSettings = NoticeSettings & {
  notify_on_assign: boolean
  auto_retrain: boolean
  retrain_due_days: number
  last_auto_retrain_on: string | null
}

export const TRAINING_NOTICE_DEFAULTS: TrainingNoticeSettings = {
  notify_on_assign: true,
  due_reminder_days: 3,
  overdue_notices: true,
  expiring_notice_days: 30,
  auto_retrain: false,
  retrain_due_days: 30,
  last_auto_retrain_on: null
}

export const getTrainingNoticeSettings = async (organizationId: string): Promise<TrainingNoticeSettings> => {
  const { data } = await (createServiceRoleClient() as any)
    .from('forge_training_settings')
    .select('notify_on_assign, due_reminder_days, overdue_notices, expiring_notice_days, auto_retrain, retrain_due_days, last_auto_retrain_on')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return data ? { ...TRAINING_NOTICE_DEFAULTS, ...data } : TRAINING_NOTICE_DEFAULTS
}

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`

type NoticeItem = { kind: string; subject_id: string; user_id: string; title: string; body: string; link_path: string }

const queue = async (organizationId: string, items: NoticeItem[]) => {
  if (!items.length) return { queued: 0, duplicate: 0, skipped: 0 }

  const supabase = createServiceRoleClient() as any
  const totals = { queued: 0, duplicate: 0, skipped: 0 }

  for (let start = 0; start < items.length; start += 500) {
    const { data, error } = await supabase.rpc('forge_training_queue_notices', { p_organization_id: organizationId, p_items: items.slice(start, start + 500) })

    if (error) throw new Error('Unable to queue training notices: ' + error.message)

    totals.queued += data?.queued || 0
    totals.duplicate += data?.duplicate || 0
    totals.skipped += data?.skipped || 0
  }

  return totals
}

/**
 * "New training assigned to you" for these assignments, when the organization has it on. Never throws:
 * a notice problem must not undo the assignment (1.0 behaved the same way).
 */
export const notifyTrainingAssigned = async (organizationId: string, assignmentIds: string[]) => {
  if (!assignmentIds.length) return { queued: 0 }

  try {
    const settings = await getTrainingNoticeSettings(organizationId)

    if (!settings.notify_on_assign) return { queued: 0 }

    const { data } = await (createServiceRoleClient() as any)
      .from('forge_training_assignments')
      .select('id, forge_training_courses(title), forge_personnel!inner(auth_user_id, archived_at)')
      .eq('organization_id', organizationId)
      .in('id', assignmentIds)

    const items: NoticeItem[] = (data || [])
      .filter((row: any) => row.forge_personnel?.auth_user_id && !row.forge_personnel.archived_at)
      .map((row: any) => ({
        kind: 'assigned',
        subject_id: row.id,
        user_id: row.forge_personnel.auth_user_id,
        link_path: '/my-training/' + row.id,
        ...NOTICE_TEXT.assigned(row.forge_training_courses?.title || 'Training')
      }))

    return await queue(organizationId, items)
  } catch (error) {
    console.error('[training] assignment notice', organizationId, (error as Error).message)

    return { queued: 0 }
  }
}

/** Due-soon and overdue reminders, and expiring-certification notices, for one organization. */
export const queueTrainingReminders = async (organizationId: string, settings: TrainingNoticeSettings, todayIso = trainingTodayIso()) => {
  const supabase = createServiceRoleClient() as any
  const horizon = addDaysToIso(todayIso, Math.max(settings.due_reminder_days, 0))

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase
      .from('forge_training_assignments')
      .select('id, status, due_date, forge_training_courses(title), forge_personnel!inner(auth_user_id, archived_at, employment_status)')
      .eq('organization_id', organizationId)
      .in('status', ['assigned', 'in_progress', 'overdue'])
      .not('due_date', 'is', null)
      .lte('due_date', horizon),
    settings.expiring_notice_days > 0
      ? supabase
          .from('forge_training_completions')
          .select('id, course_id, personnel_id, expires_at, completed_at, forge_training_courses(title), forge_personnel!inner(auth_user_id, archived_at, employment_status)')
          .eq('organization_id', organizationId)
          .eq('approval_status', 'approved')
          .in('result', ['passed', 'completed'])
          .is('archived_at', null)
          .gte('expires_at', todayIso)
          .lte('expires_at', addDaysToIso(todayIso, settings.expiring_notice_days))
      : Promise.resolve({ data: [] })
  ])

  const reachable = (person: any) => person?.auth_user_id && !person.archived_at && !['terminated', 'inactive'].includes(person.employment_status)
  const items: NoticeItem[] = []

  for (const row of assignments || []) {
    const kind = assignmentReminder(row, settings, todayIso)

    if (!kind || !reachable(row.forge_personnel)) continue

    const course = row.forge_training_courses?.title || 'Training'

    items.push({
      kind,
      subject_id: row.id,
      user_id: row.forge_personnel.auth_user_id,
      link_path: '/my-training/' + row.id,
      ...(kind === 'overdue' ? NOTICE_TEXT.overdue(course, usDate(row.due_date)) : NOTICE_TEXT.due_soon(course, usDate(row.due_date)))
    })
  }

  // Only the newest completion per person and course can expire; an older one was already replaced.
  const newest = new Map<string, any>()

  if ((completions || []).length) {
    const people = [...new Set((completions || []).map((row: any) => row.personnel_id))]
    const courses = [...new Set((completions || []).map((row: any) => row.course_id))]

    const { data: later } = await supabase
      .from('forge_training_completions')
      .select('personnel_id, course_id, completed_at')
      .eq('organization_id', organizationId)
      .eq('approval_status', 'approved')
      .in('result', ['passed', 'completed'])
      .in('personnel_id', people)
      .in('course_id', courses)
      .is('archived_at', null)

    for (const row of later || []) {
      const key = row.personnel_id + ':' + row.course_id

      if (!newest.has(key) || row.completed_at > newest.get(key)) newest.set(key, row.completed_at)
    }
  }

  for (const row of completions || []) {
    if (newest.get(row.personnel_id + ':' + row.course_id) !== row.completed_at) continue
    if (!expiringNoticeDue(row.expires_at, settings, todayIso) || !reachable(row.forge_personnel)) continue

    items.push({
      kind: 'expiring',
      subject_id: row.id,
      user_id: row.forge_personnel.auth_user_id,
      link_path: '/my-training',
      ...NOTICE_TEXT.expiring(row.forge_training_courses?.title || 'Training', usDate(row.expires_at))
    })
  }

  return queue(organizationId, items)
}

/**
 * Automatic retraining (new in 2.0; 1.0 had none): once a day, for each active group, assign required courses
 * that are missing, expired or expiring, due `retrain_due_days` out. Members already holding an open
 * assignment or a current completion are skipped by assignGroupRequirements.
 */
export const runAutoRetrain = async (organizationId: string, settings: TrainingNoticeSettings, todayIso = trainingTodayIso()) => {
  if (!settings.auto_retrain) return { ran: false, created: 0 }

  const supabase = createServiceRoleClient() as any
  const { data: claimed, error } = await supabase.rpc('forge_training_mark_auto_retrain', { p_organization_id: organizationId, p_today: todayIso })

  if (error) throw new Error('Unable to start automatic retraining: ' + error.message)
  if (!claimed) return { ran: false, created: 0 }

  const { data: groups } = await supabase.from('forge_training_groups').select('id').eq('organization_id', organizationId).eq('is_active', true)
  const created: string[] = []

  for (const group of groups || []) {
    const result = await assignGroupRequirements({
      organizationId,
      groupId: group.id,
      dueDate: addDaysToIso(todayIso, settings.retrain_due_days),
      actorUserId: null,
      scope: 'organization',
      note: 'Assigned automatically: required training is missing, expired or expiring.'
    })

    created.push(...result.ids)
  }

  await notifyTrainingAssigned(organizationId, created)

  return { ran: true, created: created.length }
}

/**
 * The hourly job: retraining (once a day) and reminders for every organization that has training
 * assignments or completions. Reminders are on by default, so an organization needs no settings row.
 */
export const runTrainingCron = async () => {
  const supabase = createServiceRoleClient() as any

  const [{ data: open, error }, { data: certified }] = await Promise.all([
    supabase.from('forge_training_assignments').select('organization_id').in('status', ['assigned', 'in_progress', 'overdue']),
    supabase.from('forge_training_settings').select('organization_id')
  ])

  if (error) throw new Error('Unable to load training organizations: ' + error.message)

  const { data: expiring } = await supabase
    .from('forge_training_completions')
    .select('organization_id')
    .is('archived_at', null)
    .gte('expires_at', trainingTodayIso())
    .lte('expires_at', addDaysToIso(trainingTodayIso(), 120))

  const rows = [...new Set([...(open || []), ...(certified || []), ...(expiring || [])].map((row: any) => row.organization_id as string))].map(organization_id => ({ organization_id }))
  const results = []

  for (const row of rows) {
    const organizationId = row.organization_id

    try {
      const settings = await getTrainingNoticeSettings(organizationId)
      const retrain = await runAutoRetrain(organizationId, settings)
      const reminders = await queueTrainingReminders(organizationId, settings)

      results.push({ organizationId, retrain, reminders })
    } catch (failure) {
      console.error('[training] cron', organizationId, (failure as Error).message)
      results.push({ organizationId, error: (failure as Error).message })
    }
  }

  return { checked: rows.length, results }
}
