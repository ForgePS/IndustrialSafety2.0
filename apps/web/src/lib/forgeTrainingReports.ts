import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getCompletionFiles } from '@/lib/forgeTrainingFiles'
import { trainingTodayIso } from '@/lib/forgeTrainingLms'
import { activityByCourse, addDaysToIso, overdueAssignments, trainingQc } from '@/lib/forgeTrainingReportRules'
import { matrixStatus } from '@/lib/forgeTrainingRules'

/**
 * Training reports (1.0 records search, personnel history, team roster / recent activity, missed report, QC).
 * Each follows the viewer's personnel scope for the permission that opened it.
 */

type Scope = { organizationId: string; userId: string; permission: EffectivePermission }

const PAGE_LIMIT = 5000

export const personLabel = (person: any) =>
  person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') || person.employee_number || 'Unnamed' : '—'

/** People in scope, keyed by id. Organization scope still loads them, for names and departments. */
const scopedPeople = async ({ organizationId, userId, permission }: Scope, includeArchived = true) => {
  const people = await getScopedPersonnel({ organizationId, userId, permission, includeArchived })

  return new Map<string, any>(people.map((person: any) => [person.id, person]))
}

/** Filters a query to people in scope; organization scope needs no filter (and no long id list). */
const inScope = (query: any, permission: EffectivePermission, people: Map<string, any>) =>
  permission.scope === 'organization' ? query : query.in('personnel_id', people.size ? [...people.keys()] : ['00000000-0000-0000-0000-000000000000'])

export const getActiveCourses = async (organizationId: string) => {
  const { data } = await (createServiceRoleClient() as any).from('forge_training_courses').select('id, title, course_code, is_active').eq('organization_id', organizationId).order('title')

  return (data || []) as Array<{ id: string; title: string; course_code: string | null; is_active: boolean }>
}

// ---------------------------------------------------------------------------
// Records search
// ---------------------------------------------------------------------------

export type RecordFilters = { courseId?: string; q?: string; from?: string; to?: string; source?: string; result?: string }

export const TRAINING_SOURCE_LABELS: Record<string, string> = { manual: 'Recorded', online: 'Online', kiosk: 'Kiosk', paper: 'Paper' }

/**
 * Completions matching the filters, newest first. Unlike 1.0 the text search also matches the person's name
 * and employee number, and the result is the recorded one (1.0 called any scored record "passed").
 */
export const searchTrainingRecords = async (scope: Scope, filters: RecordFilters) => {
  const supabase = createServiceRoleClient() as any
  const people = await scopedPeople(scope)

  let query = supabase
    .from('forge_training_completions')
    .select('id, course_id, personnel_id, completed_at, expires_at, result, score, source, certificate_number, approval_status, instructor, notes, forge_training_courses(title, course_code)')
    .eq('organization_id', scope.organizationId)
    .is('archived_at', null)
    .order('completed_at', { ascending: false })
    .limit(PAGE_LIMIT)

  query = inScope(query, scope.permission, people)
  if (filters.courseId) query = query.eq('course_id', filters.courseId)
  if (filters.from) query = query.gte('completed_at', filters.from + 'T00:00:00Z')
  if (filters.to) query = query.lte('completed_at', filters.to + 'T23:59:59Z')
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.result) query = query.eq('result', filters.result)

  const { data, error } = await query

  if (error) throw new Error('Unable to search training records: ' + error.message)

  const needle = String(filters.q || '').trim().toLowerCase()

  const rows = (data || [])
    .filter((row: any) => people.has(row.personnel_id))
    .map((row: any) => {
      const person = people.get(row.personnel_id)

      return {
        ...row,
        personName: personLabel(person),
        employeeNumber: person?.employee_number || '',
        department: person?.department?.name || '',
        location: person?.locations?.name || '',
        archived: Boolean(person?.archived_at),
        courseTitle: row.forge_training_courses?.title || '—'
      }
    })
    .filter(
      (row: any) =>
        !needle ||
        row.personName.toLowerCase().includes(needle) ||
        row.employeeNumber.toLowerCase().includes(needle) ||
        row.courseTitle.toLowerCase().includes(needle) ||
        String(row.certificate_number || '').toLowerCase().includes(needle)
    )

  const files = await getCompletionFiles(scope.organizationId, rows.slice(0, 500).map((row: any) => row.id))

  return { rows, files, truncated: (data || []).length >= PAGE_LIMIT }
}

// ---------------------------------------------------------------------------
// Personnel history
// ---------------------------------------------------------------------------

/** One person's open assignments, every completion with its status and attachments. */
export const getPersonTrainingHistory = async (organizationId: string, personnelId: string) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase
      .from('forge_training_assignments')
      .select('id, course_id, status, due_date, assigned_at, forge_training_courses(title)')
      .eq('organization_id', organizationId)
      .eq('personnel_id', personnelId)
      .in('status', ['assigned', 'in_progress', 'overdue'])
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('forge_training_completions')
      .select('id, course_id, completed_at, expires_at, result, score, source, approval_status, certificate_number, instructor, notes, forge_training_courses(title)')
      .eq('organization_id', organizationId)
      .eq('personnel_id', personnelId)
      .is('archived_at', null)
      .order('completed_at', { ascending: false })
  ])

  const today = trainingTodayIso()
  const files = await getCompletionFiles(organizationId, (completions || []).map((row: any) => row.id))

  // Status per completion: only the newest valid one for a course decides current / expiring / expired.
  const newestValid = new Map<string, string>()

  for (const row of completions || []) {
    if (row.approval_status !== 'approved' || !['passed', 'completed'].includes(row.result)) continue
    if (!newestValid.has(row.course_id)) newestValid.set(row.course_id, row.id)
  }

  return {
    open: (assignments || []).map((row: any) => ({ ...row, courseTitle: row.forge_training_courses?.title || '—', late: Boolean(row.due_date && row.due_date < today) })),
    records: (completions || []).map((row: any) => {
      const valid = newestValid.get(row.course_id) === row.id

      const status = !valid
        ? row.approval_status !== 'approved'
          ? row.approval_status
          : 'superseded'
        : matrixStatus({ completions: [row], assignments: [], required: false, todayIso: today }).status

      return { ...row, courseTitle: row.forge_training_courses?.title || '—', status, files: files.get(row.id) || [] }
    })
  }
}

// ---------------------------------------------------------------------------
// Overdue (1.0 missed report)
// ---------------------------------------------------------------------------

export const getOverdueTraining = async (scope: Scope) => {
  const supabase = createServiceRoleClient() as any
  const today = trainingTodayIso()
  const people = await scopedPeople(scope, false)
  let query = supabase
    .from('forge_training_assignments')
    .select('id, course_id, personnel_id, status, due_date, assigned_at, forge_training_courses(title)')
    .eq('organization_id', scope.organizationId)
    .in('status', ['assigned', 'in_progress', 'overdue'])
    .lt('due_date', today)
    .limit(PAGE_LIMIT)

  query = inScope(query, scope.permission, people)

  const { data, error } = await query

  if (error) throw new Error('Unable to load overdue training: ' + error.message)

  return overdueAssignments((data || []).filter((row: any) => people.has(row.personnel_id)), today).map((row: any) => {
    const person = people.get(row.personnel_id)

    return {
      ...row,
      personName: personLabel(person),
      employeeNumber: person?.employee_number || '',
      department: person?.department?.name || '',
      location: person?.locations?.name || '',
      courseTitle: row.forge_training_courses?.title || '—'
    }
  })
}

// ---------------------------------------------------------------------------
// Team activity (1.0 team roster / recent activity by course)
// ---------------------------------------------------------------------------

export const getTrainingActivity = async (scope: Scope, { from, to, locationId, groupId }: { from: string; to: string; locationId?: string; groupId?: string }) => {
  const supabase = createServiceRoleClient() as any
  const people = await scopedPeople(scope)

  if (locationId) for (const [id, person] of people) if (person.location_id !== locationId) people.delete(id)

  if (groupId) {
    const { data: members } = await supabase.from('forge_training_group_members').select('personnel_id').eq('organization_id', scope.organizationId).eq('group_id', groupId)
    const inGroup = new Set((members || []).map((row: any) => row.personnel_id))

    for (const id of [...people.keys()]) if (!inGroup.has(id)) people.delete(id)
  }

  const filtered = scope.permission.scope !== 'organization' || locationId || groupId
  const restrict = (query: any) => (filtered ? query.in('personnel_id', people.size ? [...people.keys()] : ['00000000-0000-0000-0000-000000000000']) : query)

  const [{ data: assignments }, { data: completions }, courses] = await Promise.all([
    restrict(
      supabase
        .from('forge_training_assignments')
        .select('id, course_id, personnel_id, status, due_date, assigned_at, updated_at')
        .eq('organization_id', scope.organizationId)
        .neq('status', 'canceled')
        .or(`assigned_at.gte.${from}T00:00:00Z,updated_at.gte.${from}T00:00:00Z`)
        .limit(PAGE_LIMIT)
    ),
    restrict(
      supabase
        .from('forge_training_completions')
        .select('course_id, personnel_id, completed_at')
        .eq('organization_id', scope.organizationId)
        .is('archived_at', null)
        .gte('completed_at', from + 'T00:00:00Z')
        .lte('completed_at', to + 'T23:59:59Z')
        .limit(PAGE_LIMIT)
    ),
    getActiveCourses(scope.organizationId)
  ])

  const titles = new Map(courses.map(course => [course.id, course.title]))
  const mine = (row: any) => people.has(row.personnel_id)

  return activityByCourse({ assignments: (assignments || []).filter(mine), completions: (completions || []).filter(mine), from, to }).map(row => ({
    ...row,
    courseTitle: titles.get(row.courseId) || '—'
  }))
}

// ---------------------------------------------------------------------------
// Quiz QC
// ---------------------------------------------------------------------------

export const QC_DAY_OPTIONS = [30, 90, 180, 365, 0] as const

/** Quiz quality for one course or all, over the last `days` (0 = all time), within the viewer's scope. */
export const getTrainingQc = async (scope: Scope, { courseId, days }: { courseId?: string; days: number }) => {
  const supabase = createServiceRoleClient() as any
  const people = await scopedPeople(scope)
  let query = supabase
    .from('forge_training_attempts')
    .select('id, course_id, personnel_id, attempt_number, status, question_ids, answers, score_percent, passed, submitted_at, started_at')
    .eq('organization_id', scope.organizationId)
    .order('started_at', { ascending: false })
    .limit(20000)

  query = inScope(query, scope.permission, people)
  if (courseId) query = query.eq('course_id', courseId)
  if (days > 0) query = query.gte('started_at', addDaysToIso(trainingTodayIso(), -days) + 'T00:00:00Z')

  const { data: attempts, error } = await query

  if (error) throw new Error('Unable to load quiz attempts: ' + error.message)

  const mine = (attempts || []).filter((row: any) => people.has(row.personnel_id))
  const questionIds = [...new Set(mine.flatMap((row: any) => row.question_ids || []))]
  const questions: any[] = []

  for (let start = 0; start < questionIds.length; start += 300) {
    const { data } = await supabase
      .from('forge_training_questions')
      .select('id, stem, correct_index, forge_training_course_versions!inner(course_id)')
      .in('id', questionIds.slice(start, start + 300))

    questions.push(...(data || []))
  }

  const report = trainingQc({
    attempts: mine,
    questions: questions.map(row => ({ id: row.id, stem: row.stem, correct_index: row.correct_index, course_id: row.forge_training_course_versions?.course_id }))
  })

  return { ...report, truncated: (attempts || []).length >= 20000 }
}

// ---------------------------------------------------------------------------
// Library across courses
// ---------------------------------------------------------------------------

export const getTrainingLibrary = async (organizationId: string) => {
  const { data } = await (createServiceRoleClient() as any)
    .from('forge_training_materials')
    .select('id, course_id, title, description, file_name, content_type, size_bytes, topic, uploaded_at, forge_training_courses!inner(title, is_active), forge_training_material_folders(name)')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })

  return (data || []) as any[]
}
