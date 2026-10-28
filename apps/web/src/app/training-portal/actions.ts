'use server'

import { cookies, headers } from 'next/headers'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import {
  PORTAL_COOKIE,
  PORTAL_SESSION_MINUTES,
  completeLearnerCourse,
  completeLearnerSection,
  hashToken,
  materialSignedUrl,
  newToken,
  resolvePortalLink,
  resolvePortalSession,
  startLearnerQuiz,
  submitLearnerQuiz
} from '@/lib/forgeTrainingLms'

type Result = { error?: string; message?: string; url?: string; passed?: boolean; completionId?: string | null }

const GENERIC_FAILURE = 'That employee number was not recognized for this training kiosk.'

const clientIp = async () => {
  const list = await headers()

  return (list.get('x-forwarded-for') || '').split(',')[0].trim() || list.get('x-real-ip') || 'unknown'
}

/**
 * Kiosk sign-in by employee number (1.0 behaviour), with 1.0's rate limits on both the device (IP)
 * and the employee number. Failures never reveal whether a number exists.
 */
export const portalSignIn = async (token: string, employeeNumber: string): Promise<Result> => {
  const link = await resolvePortalLink(token)

  if (!link) return { error: 'This training kiosk link is no longer active.' }

  const supabase = createServiceRoleClient() as any
  const number = employeeNumber.trim()

  if (!number || number.length > 120) return { error: 'Enter your employee number.' }

  const { data: key } = await supabase.rpc('forge_employee_number_key', { raw: number })
  const buckets = [`ip:${await clientIp()}`, `emp:${key || number.toLowerCase()}`]

  const { data: limits } = await supabase.from('forge_training_portal_rate_limits').select('blocked_until').eq('link_id', link.id).in('bucket_key', buckets)

  if ((limits || []).some((row: any) => row.blocked_until && Date.parse(row.blocked_until) > Date.now())) {
    return { error: 'Too many attempts. Wait 15 minutes and try again, or ask your supervisor.' }
  }

  const fail = async () => {
    for (const bucket of buckets) await supabase.rpc('forge_training_portal_register_failure', { p_link_id: link.id, p_bucket_key: bucket })

    return { error: GENERIC_FAILURE }
  }

  const { data: matches } = await supabase.rpc('forge_find_personnel_by_employee_number', {
    p_organization_id: link.organization_id,
    p_employee_number: number
  })

  const person = (matches || [])[0]

  if (!person || person.employment_status === 'terminated') return fail()
  if (link.location_id && person.location_id !== link.location_id) return fail()

  const sessionToken = newToken()
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_MINUTES * 60_000)

  const { error } = await supabase.from('forge_training_portal_sessions').insert({
    organization_id: link.organization_id,
    link_id: link.id,
    personnel_id: person.id,
    session_token_hash: hashToken(sessionToken),
    expires_at: expiresAt.toISOString()
  })

  if (error) return { error: 'Unable to sign in right now.' }

  await supabase.from('forge_training_portal_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.id)
  await supabase.from('forge_training_portal_rate_limits').delete().eq('link_id', link.id).eq('bucket_key', buckets[1])

  const store = await cookies()

  store.set(PORTAL_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: `/training-portal/${token}`,
    expires: expiresAt
  })

  return { message: `Welcome, ${person.first_name}.` }
}

export const portalSignOut = async (token: string): Promise<Result> => {
  const store = await cookies()
  const sessionToken = store.get(PORTAL_COOKIE)?.value

  if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) {
    const supabase = createServiceRoleClient() as any

    await supabase.from('forge_training_portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_token_hash', hashToken(sessionToken))
  }

  store.delete({ name: PORTAL_COOKIE, path: `/training-portal/${token}` })

  return { message: 'Signed out.' }
}

/** Confirms the kiosk session and that the assignment belongs to the signed-in employee. */
const loadPortalAssignment = async (token: string, assignmentId: string) => {
  const link = await resolvePortalLink(token)

  if (!link) return { error: 'This training kiosk link is no longer active.' as const }

  const store = await cookies()
  const session = await resolvePortalSession(link, store.get(PORTAL_COOKIE)?.value)

  if (!session) return { error: 'Your kiosk session ended. Sign in again with your employee number.' as const }

  const supabase = createServiceRoleClient() as any

  const { data: assignment } = await supabase
    .from('forge_training_assignments')
    .select('id, course_id')
    .eq('organization_id', link.organization_id)
    .eq('id', assignmentId)
    .eq('personnel_id', session.personnel_id)
    .maybeSingle()

  if (!assignment) return { error: 'Training not found.' as const }

  return { link, session, assignment }
}

export const portalCompleteSection = async (token: string, assignmentId: string, sectionId: string): Promise<Result> => {
  const target = await loadPortalAssignment(token, assignmentId)

  if ('error' in target) return { error: target.error }

  return completeLearnerSection(target.link.organization_id, assignmentId, sectionId)
}

export const portalStartQuiz = async (token: string, assignmentId: string): Promise<Result> => {
  const target = await loadPortalAssignment(token, assignmentId)

  if ('error' in target) return { error: target.error }

  return startLearnerQuiz(target.link.organization_id, assignmentId, 'kiosk', null)
}

export const portalSubmitQuiz = async (token: string, assignmentId: string, attemptId: string, answers: number[], acknowledged: boolean): Promise<Result> => {
  const target = await loadPortalAssignment(token, assignmentId)

  if ('error' in target) return { error: target.error }

  const supabase = createServiceRoleClient() as any
  const { data: attempt } = await supabase.from('forge_training_attempts').select('id').eq('id', attemptId).eq('assignment_id', assignmentId).maybeSingle()

  if (!attempt) return { error: 'Quiz not found.' }

  const result = await submitLearnerQuiz(target.link.organization_id, attemptId, answers, acknowledged, null)

  if (!result.error) {
    // Kiosk learners have no login, so the audit actor is empty and the personnel id is recorded instead.
    await writeForgeAudit({
      actorUserId: null,
      organizationId: target.link.organization_id,
      action: 'training.kiosk_quiz_submitted',
      entityType: 'training_attempt',
      entityId: attemptId,
      afterValue: { link_id: target.link.id, personnel_id: target.session.personnel_id, passed: result.passed ?? null }
    }).catch(() => undefined)
  }

  return result
}

export const portalCompleteCourse = async (token: string, assignmentId: string, acknowledged: boolean): Promise<Result> => {
  const target = await loadPortalAssignment(token, assignmentId)

  if ('error' in target) return { error: target.error }

  const result = await completeLearnerCourse(target.link.organization_id, assignmentId, 'kiosk', acknowledged, null)

  if (!result.error) {
    // Kiosk learners have no login, so the audit actor is empty and the personnel id is recorded instead.
    await writeForgeAudit({
      actorUserId: null,
      organizationId: target.link.organization_id,
      action: 'training.kiosk_course_completed',
      entityType: 'training_assignment',
      entityId: assignmentId,
      afterValue: { link_id: target.link.id, personnel_id: target.session.personnel_id, completion_id: result.completionId ?? null }
    }).catch(() => undefined)
  }

  return result
}

export const portalOpenMaterial = async (token: string, assignmentId: string, materialId: string): Promise<Result> => {
  const target = await loadPortalAssignment(token, assignmentId)

  if ('error' in target) return { error: target.error }

  return materialSignedUrl(target.link.organization_id, target.assignment.course_id, materialId)
}
