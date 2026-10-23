import { createHash, randomBytes } from 'node:crypto'

import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { OSHA_TIME_ZONE } from '@/lib/forgeOsha'
import { zonedDateTimeParts } from '@/lib/forgeOshaRules'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { contentComplete, isOpenAssignment, matrixStatus } from '@/lib/forgeTrainingRules'
import type { MatrixStatus } from '@/lib/forgeTrainingRules'

export const TRAINING_BUCKET = 'forge-training'
export const PORTAL_COOKIE = 'forge-training-portal'
export const PORTAL_SESSION_MINUTES = 60
export const MATERIAL_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'text/plain'] as const
export const MATERIAL_MAX_BYTES = 52_428_800

export const trainingTodayIso = () => zonedDateTimeParts(new Date().toISOString(), OSHA_TIME_ZONE).date

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const newToken = () => randomBytes(32).toString('hex')

/** Readable messages for errors raised by the training database functions and constraints. */
export const trainingErrorMessage = (error: { code?: string; message?: string } | null | undefined, fallback = 'Unable to save.') => {
  const message = error?.message || ''

  if (!error) return fallback
  if (/forge_training_questions_correct_in_range/.test(message)) return 'Choose which answer is correct.'
  if (/forge_training_questions_choices_filled|choices_check/.test(message)) return 'Questions need 2 to 6 answers, and none can be blank.'
  if (/forge_training_versions_ack_text/.test(message)) return 'Enter the acknowledgement text employees must accept.'
  if (/forge_training_groups_active_name_idx/.test(message)) return 'An active group with this name already exists.'
  if (/forge_training_attempts_one_open_idx/.test(message)) return 'A quiz is already in progress for this training.'

  // Database functions raise plain-language messages for business rules.
  return message || fallback
}

// ---------------------------------------------------------------------------
// Course content (admin)
// ---------------------------------------------------------------------------

export const getCourseContent = async (organizationId: string, courseId: string) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: course }, { data: versions }, { data: materials }] = await Promise.all([
    supabase.from('forge_training_courses').select('*').eq('organization_id', organizationId).eq('id', courseId).maybeSingle(),
    supabase.from('forge_training_course_versions').select('*').eq('organization_id', organizationId).eq('course_id', courseId).order('version_number', { ascending: false }),
    supabase.from('forge_training_materials').select('*').eq('organization_id', organizationId).eq('course_id', courseId).is('archived_at', null).order('uploaded_at')
  ])

  if (!course) return null

  const draft = (versions || []).find((item: any) => item.status === 'draft') || null
  const published = (versions || []).find((item: any) => item.status === 'published') || null
  const editing = draft || published

  const [{ data: sections }, { data: questions }] = editing
    ? await Promise.all([
        supabase.from('forge_training_sections').select('*').eq('version_id', editing.id).order('sort_order').order('created_at'),
        supabase.from('forge_training_questions').select('*').eq('version_id', editing.id).order('sort_order').order('created_at')
      ])
    : [{ data: [] }, { data: [] }]

  return { course, versions: versions || [], draft, published, editing, sections: sections || [], questions: questions || [], materials: materials || [] }
}

// ---------------------------------------------------------------------------
// Learner engine (shared by My Training and the kiosk portal)
// ---------------------------------------------------------------------------

/** Loads everything a learner sees for one assignment. Correct answers are never included. */
export const getLearnerView = async (organizationId: string, assignmentId: string) => {
  const supabase = createServiceRoleClient() as any

  const { data: assignment } = await supabase
    .from('forge_training_assignments')
    .select('*, forge_training_courses(id, title, description, validity_months, duration_minutes)')
    .eq('organization_id', organizationId)
    .eq('id', assignmentId)
    .maybeSingle()

  if (!assignment) return null

  const { data: version } = await supabase
    .from('forge_training_course_versions')
    .select('*')
    .eq('course_id', assignment.course_id)
    .eq('status', 'published')
    .maybeSingle()

  const [{ data: sections }, { data: materials }, { data: progress }, { data: attempts }, { count: questionCount }, { data: completion }] = await Promise.all([
    version ? supabase.from('forge_training_sections').select('*').eq('version_id', version.id).order('sort_order').order('created_at') : { data: [] },
    supabase.from('forge_training_materials').select('id, title, file_name, content_type, size_bytes').eq('course_id', assignment.course_id).is('archived_at', null),
    supabase.from('forge_training_progress').select('*').eq('assignment_id', assignmentId).maybeSingle(),
    supabase.from('forge_training_attempts').select('*').eq('assignment_id', assignmentId).order('attempt_number', { ascending: false }),
    version
      ? supabase.from('forge_training_questions').select('id', { count: 'exact', head: true }).eq('version_id', version.id).eq('is_active', true)
      : { count: 0 },

    // The approved completion for this assignment, for the certificate link on courses without a quiz.
    supabase
      .from('forge_training_completions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('assignment_id', assignmentId)
      .eq('approval_status', 'approved')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  const openAttempt = (attempts || []).find((item: any) => item.status === 'in_progress') || null
  const lastSubmitted = (attempts || []).find((item: any) => item.status === 'submitted') || null

  // Question text for the open attempt (no answers), or the review for the last submitted online attempt.
  const questionIds = openAttempt?.question_ids || (lastSubmitted?.question_ids?.length ? lastSubmitted.question_ids : [])

  const { data: questionRows } = questionIds.length
    ? await supabase.from('forge_training_questions').select('id, stem, choices, correct_index, explanation').in('id', questionIds)
    : { data: [] }

  const byId = new Map<string, any>((questionRows || []).map((row: any) => [row.id, row]))

  const quiz = openAttempt
    ? {
        attemptId: openAttempt.id,
        attemptNumber: openAttempt.attempt_number,
        questions: openAttempt.question_ids.map((id: string) => ({ id, stem: byId.get(id)?.stem || '', choices: byId.get(id)?.choices || [] }))
      }
    : null

  const review =
    !openAttempt && lastSubmitted && lastSubmitted.channel !== 'paper'
      ? {
          attemptNumber: lastSubmitted.attempt_number,
          scorePercent: lastSubmitted.score_percent,
          passed: lastSubmitted.passed,
          completionId: lastSubmitted.completion_id,

          // Only failed attempts show which answers were wrong, so retakes stay meaningful;
          // a pass shows the explanations.
          items: lastSubmitted.question_ids.map((id: string, index: number) => {
            const question = byId.get(id)
            const answer = lastSubmitted.answers?.[index] ?? null
            const correct = question ? answer === question.correct_index : false

            return {
              stem: question?.stem || '',
              chosen: answer !== null && question ? question.choices[answer] : null,
              correct,
              explanation: lastSubmitted.passed ? question?.explanation || null : null
            }
          })
        }
      : null

  const used = (attempts || []).filter((item: any) => item.status === 'submitted' && item.channel !== 'paper').length
  const completed = progress?.version_id === version?.id ? progress?.sections_completed || [] : []

  return {
    assignment,
    course: assignment.forge_training_courses,
    version,
    sections: sections || [],
    materials: materials || [],
    completedSections: completed as string[],
    contentDone: version ? contentComplete(sections || [], completed) : false,
    hasQuiz: Boolean(questionCount),
    attemptsUsed: used,
    attemptsRemaining: version?.max_attempts ? Math.max(version.max_attempts - used, 0) : null,
    quiz,
    review,
    completionId: (completion?.id as string | undefined) || null,
    attempts: attempts || []
  }
}

export type LearnerView = NonNullable<Awaited<ReturnType<typeof getLearnerView>>>

/** Marks a section complete and records when all required content is done. */
export const completeLearnerSection = async (organizationId: string, assignmentId: string, sectionId: string) => {
  const supabase = createServiceRoleClient() as any
  const view = await getLearnerView(organizationId, assignmentId)

  if (!view || !view.version) return { error: 'This course has no published content.' }
  if (!isOpenAssignment(view.assignment.status)) return { error: 'This training is already finished.' }
  if (!view.sections.some((section: any) => section.id === sectionId)) return { error: 'Section not found.' }

  const done = Array.from(new Set([...view.completedSections, sectionId]))
  const now = new Date().toISOString()
  const finished = contentComplete(view.sections, done)

  const { error } = await supabase.from('forge_training_progress').upsert(
    {
      assignment_id: assignmentId,
      organization_id: organizationId,
      version_id: view.version.id,
      sections_completed: done,
      content_completed_at: finished ? now : null,
      last_accessed_at: now
    },
    { onConflict: 'assignment_id' }
  )

  if (error) return { error: trainingErrorMessage(error) }

  if (view.assignment.status === 'assigned' || view.assignment.status === 'overdue') {
    await supabase.from('forge_training_assignments').update({ status: 'in_progress', updated_at: now }).eq('id', assignmentId).in('status', ['assigned', 'overdue'])
  }

  if (!finished) return { message: 'Section complete.' }

  return { message: view.hasQuiz ? 'All required sections are done. The quiz is open.' : 'All required sections are done. Complete the course below.' }
}

/** Completes a course that has no quiz, once its required sections are done (and acknowledged, if required). */
export const completeLearnerCourse = async (
  organizationId: string,
  assignmentId: string,
  channel: 'online' | 'kiosk',
  acknowledged: boolean,
  actorUserId: string | null
) => {
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase.rpc('forge_complete_training_without_quiz', {
    p_organization_id: organizationId,
    p_assignment_id: assignmentId,
    p_channel: channel,
    p_acknowledged: Boolean(acknowledged),
    p_actor_user_id: actorUserId
  })

  if (error) return { error: trainingErrorMessage(error) }

  return { message: 'Course complete.', passed: true, completionId: (data as string | null) || null }
}

export const startLearnerQuiz = async (organizationId: string, assignmentId: string, channel: 'online' | 'kiosk', actorUserId: string | null) => {
  const supabase = createServiceRoleClient() as any

  const { error } = await supabase.rpc('forge_start_training_attempt', {
    p_organization_id: organizationId,
    p_assignment_id: assignmentId,
    p_channel: channel,
    p_actor_user_id: actorUserId
  })

  return error ? { error: trainingErrorMessage(error) } : { message: 'Quiz started.' }
}

export const submitLearnerQuiz = async (
  organizationId: string,
  attemptId: string,
  answers: number[],
  acknowledged: boolean,
  actorUserId: string | null
) => {
  const supabase = createServiceRoleClient() as any

  if (!Array.isArray(answers) || answers.some(answer => !Number.isInteger(answer) || answer < 0 || answer > 5)) {
    return { error: 'Answer every question before submitting.' }
  }

  const { data, error } = await supabase.rpc('forge_submit_training_attempt', {
    p_organization_id: organizationId,
    p_attempt_id: attemptId,
    p_answers: answers,
    p_acknowledged: acknowledged,
    p_actor_user_id: actorUserId
  })

  if (error) return { error: trainingErrorMessage(error) }

  return {
    message: data.passed ? `Passed with ${data.score_percent}%.` : `Scored ${data.score_percent}%. ${data.passing_percent}% is needed to pass.`,
    passed: Boolean(data.passed),
    completionId: data.completion_id as string | null
  }
}

/** Short-lived signed link to a course material. */
export const materialSignedUrl = async (organizationId: string, courseId: string, materialId: string) => {
  const supabase = createServiceRoleClient() as any

  const { data: material } = await supabase
    .from('forge_training_materials')
    .select('storage_path, file_name')
    .eq('organization_id', organizationId)
    .eq('course_id', courseId)
    .eq('id', materialId)
    .is('archived_at', null)
    .maybeSingle()

  if (!material) return { error: 'Material not found.' }

  const { data, error } = await supabase.storage.from(TRAINING_BUCKET).createSignedUrl(material.storage_path, 600, { download: false })

  return error || !data?.signedUrl ? { error: 'Unable to open this material.' } : { url: data.signedUrl as string }
}

// ---------------------------------------------------------------------------
// Kiosk portal sessions
// ---------------------------------------------------------------------------

/** The active link for a raw token, or null. */
export const resolvePortalLink = async (token: string) => {
  if (!/^[a-f0-9]{64}$/.test(token)) return null

  const supabase = createServiceRoleClient() as any

  const { data: link } = await supabase
    .from('forge_training_portal_links')
    .select('*, organizations(name)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!link || !link.is_active) return null
  if (link.expires_at && Date.parse(link.expires_at) < Date.now()) return null

  return link
}

/** The signed-in employee for this link, from the session cookie value. */
export const resolvePortalSession = async (link: any, sessionToken: string | undefined | null) => {
  if (!sessionToken || !/^[a-f0-9]{64}$/.test(sessionToken)) return null

  const supabase = createServiceRoleClient() as any

  const { data: session } = await supabase
    .from('forge_training_portal_sessions')
    .select('*, forge_personnel(id, first_name, last_name, employee_number, location_id, archived_at, employment_status)')
    .eq('session_token_hash', hashToken(sessionToken))
    .eq('link_id', link.id)
    .maybeSingle()

  if (!session || session.revoked_at || Date.parse(session.expires_at) < Date.now()) return null

  // The same rules as sign-in, rechecked on every request: a person terminated, archived or moved away from this
  // kiosk's location since signing in loses the session at once.
  const person = session.forge_personnel

  if (!person || person.archived_at || person.employment_status === 'terminated') return null
  if (link.location_id && person.location_id !== link.location_id) return null

  await supabase.from('forge_training_portal_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)

  return session
}

/** Open assignments with published content for a kiosk learner. */
export const getPortalAssignments = async (organizationId: string, personnelId: string) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_training_assignments')
    .select('id, status, due_date, course_id, forge_training_courses(title, description, duration_minutes)')
    .eq('organization_id', organizationId)
    .eq('personnel_id', personnelId)
    .in('status', ['assigned', 'in_progress', 'overdue'])
    .order('due_date', { ascending: true, nullsFirst: false })

  const courseIds = Array.from(new Set((data || []).map((row: any) => row.course_id)))

  const { data: published } = courseIds.length
    ? await supabase.from('forge_training_course_versions').select('course_id').eq('status', 'published').in('course_id', courseIds)
    : { data: [] }

  const ready = new Set((published || []).map((row: any) => row.course_id))

  return (data || []).filter((row: any) => ready.has(row.course_id))
}

// ---------------------------------------------------------------------------
// Groups and the compliance matrix
// ---------------------------------------------------------------------------

/** Creates assignments for group members who have no open assignment and no current completion. */
export const assignGroupRequirements = async ({
  organizationId,
  groupId,
  dueDate,
  actorUserId,
  scope
}: {
  organizationId: string
  groupId: string
  dueDate: string | null
  actorUserId: string

  /** The assigner's Assign Training scope; members outside it are skipped. A scheduled job passes 'organization'. */
  scope: string | null
}) => {
  const supabase = createServiceRoleClient() as any
  const today = trainingTodayIso()

  const [{ data: members }, { data: requirements }] = await Promise.all([
    supabase
      .from('forge_training_group_members')
      .select('personnel_id, forge_personnel!inner(organization_id, archived_at, location_id, division_id, auth_user_id, supervisor_user_id)')
      .eq('group_id', groupId)
      .eq('organization_id', organizationId),
    supabase.from('forge_training_group_requirements').select('course_id').eq('group_id', groupId).eq('organization_id', organizationId)
  ])

  const active = (members || []).filter((row: any) => !row.forge_personnel?.archived_at)

  const checked = await Promise.all(
    active.map(async (row: any) => ({
      personnelId: row.personnel_id as string,
      allowed: await personnelRecordWithinScope({ organizationId, userId: actorUserId, scope, record: row.forge_personnel })
    }))
  )

  const people = checked.filter(item => item.allowed).map(item => item.personnelId)
  const outOfScope = checked.length - people.length
  const courses = (requirements || []).map((row: any) => row.course_id)

  if (!people.length || !courses.length) return { created: 0, skipped: 0, outOfScope }

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase.from('forge_training_assignments').select('personnel_id, course_id, status, due_date').eq('organization_id', organizationId).in('personnel_id', people).in('course_id', courses),
    supabase
      .from('forge_training_completions')
      .select('personnel_id, course_id, completed_at, expires_at, approval_status, result')
      .eq('organization_id', organizationId)
      .in('personnel_id', people)
      .in('course_id', courses)
  ])

  const rows: any[] = []
  let skipped = 0

  for (const personnelId of people) {
    for (const courseId of courses) {
      const status = matrixStatus({
        completions: (completions || []).filter((item: any) => item.personnel_id === personnelId && item.course_id === courseId),
        assignments: (assignments || []).filter((item: any) => item.personnel_id === personnelId && item.course_id === courseId),
        required: true,
        todayIso: today
      }).status

      // Assign when nothing is open and the person is missing, expired or about to expire.
      if (status === 'missing' || status === 'expired' || status === 'expiring') {
        rows.push({
          organization_id: organizationId,
          course_id: courseId,
          personnel_id: personnelId,
          status: 'assigned',
          due_date: dueDate,
          assigned_by: actorUserId,
          notes: 'Assigned from training group requirements.'
        })
      } else {
        skipped += 1
      }
    }
  }

  if (rows.length) {
    const { error } = await supabase.from('forge_training_assignments').insert(rows)

    if (error) throw new Error(`Unable to create assignments: ${error.message}`)
  }

  return { created: rows.length, skipped, outOfScope }
}

export type MatrixRow = {
  personnelId: string
  name: string
  employeeNumber: string | null
  departmentName: string | null
  cells: Record<string, { status: MatrixStatus; expiresAt: string | null; completedAt: string | null; dueDate: string | null }>
}

/**
 * People in the viewer's personnel scope against courses. Columns are the courses any of their groups
 * require (or every active course when `allCourses`). Cells use completions, expiry and open assignments.
 */
export const getComplianceMatrix = async ({
  organizationId,
  userId,
  personnelPermission,
  groupId,
  allCourses
}: {
  organizationId: string
  userId: string
  personnelPermission: EffectivePermission
  groupId: string | null
  allCourses: boolean
}) => {
  const supabase = createServiceRoleClient() as any
  const today = trainingTodayIso()

  let people: any[] = await getScopedPersonnel({ organizationId, userId, permission: personnelPermission })

  const [{ data: memberships }, { data: requirements }, { data: courses }] = await Promise.all([
    supabase.from('forge_training_group_members').select('group_id, personnel_id, forge_training_groups!inner(is_active)').eq('organization_id', organizationId),
    supabase.from('forge_training_group_requirements').select('group_id, course_id, forge_training_groups!inner(is_active)').eq('organization_id', organizationId),
    supabase.from('forge_training_courses').select('id, title, course_code, validity_months').eq('organization_id', organizationId).eq('is_active', true).order('title')
  ])

  const activeMemberships = (memberships || []).filter((row: any) => row.forge_training_groups?.is_active)
  const activeRequirements = (requirements || []).filter((row: any) => row.forge_training_groups?.is_active)

  if (groupId) {
    const inGroup = new Set(activeMemberships.filter((row: any) => row.group_id === groupId).map((row: any) => row.personnel_id))

    people = people.filter(person => inGroup.has(person.id))
  }

  // Required courses per person, through every active group they belong to.
  const groupCourses = new Map<string, Set<string>>()

  for (const row of activeRequirements) {
    if (!groupCourses.has(row.group_id)) groupCourses.set(row.group_id, new Set())
    groupCourses.get(row.group_id)!.add(row.course_id)
  }

  const requiredFor = new Map<string, Set<string>>()

  for (const row of activeMemberships) {
    const set = requiredFor.get(row.personnel_id) || new Set<string>()

    for (const courseId of groupCourses.get(row.group_id) || []) set.add(courseId)
    requiredFor.set(row.personnel_id, set)
  }

  const requiredCourseIds = new Set<string>()

  for (const person of people) for (const courseId of requiredFor.get(person.id) || []) requiredCourseIds.add(courseId)

  const columns = (courses || []).filter((course: any) => allCourses || requiredCourseIds.has(course.id))
  const personIds = people.map(person => person.id)
  const courseIds = columns.map((course: any) => course.id)

  const [{ data: completions }, { data: assignments }] = personIds.length && courseIds.length
    ? await Promise.all([
        supabase
          .from('forge_training_completions')
          .select('personnel_id, course_id, completed_at, expires_at, approval_status, result')
          .eq('organization_id', organizationId)
          .in('personnel_id', personIds)
          .in('course_id', courseIds),
        supabase
          .from('forge_training_assignments')
          .select('personnel_id, course_id, status, due_date')
          .eq('organization_id', organizationId)
          .in('personnel_id', personIds)
          .in('course_id', courseIds)
      ])
    : [{ data: [] }, { data: [] }]

  const key = (personnelId: string, courseId: string) => `${personnelId}:${courseId}`
  const completionsBy = new Map<string, any[]>()
  const assignmentsBy = new Map<string, any[]>()

  for (const row of completions || []) completionsBy.set(key(row.personnel_id, row.course_id), [...(completionsBy.get(key(row.personnel_id, row.course_id)) || []), row])
  for (const row of assignments || []) assignmentsBy.set(key(row.personnel_id, row.course_id), [...(assignmentsBy.get(key(row.personnel_id, row.course_id)) || []), row])

  const rows: MatrixRow[] = people.map(person => ({
    personnelId: person.id,
    name: `${person.last_name}, ${person.first_name}`,
    employeeNumber: person.employee_number,
    departmentName: person.department?.name || null,
    cells: Object.fromEntries(
      columns.map((course: any) => [
        course.id,
        matrixStatus({
          completions: completionsBy.get(key(person.id, course.id)) || [],
          assignments: assignmentsBy.get(key(person.id, course.id)) || [],
          required: Boolean(requiredFor.get(person.id)?.has(course.id)),
          todayIso: today
        })
      ])
    )
  }))

  return { columns, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }
}
