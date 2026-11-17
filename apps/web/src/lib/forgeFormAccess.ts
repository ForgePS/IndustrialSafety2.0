import { createServiceRoleClient } from '@repo/supabase/server'

import { getTenantScopeAssignments } from '@/lib/forgeScope'
import type { FormSchema } from '@/lib/forgeFormRules'
import { normalizeFormSchema } from '@/lib/forgeFormRules'

/**
 * Port slice 9: who can see a form submission, and loading a submission with the form version it was filled on.
 * Server only. Every forms page, action and route checks access through here.
 *
 * Scope of a forms permission:
 * - organization: every submission in the company
 * - location / division: submissions at your locations or divisions, plus your own
 * - own / assigned: submissions you created or submitted, or that are about you (subject personnel)
 */

export type FormSubmissionScopeRow = {
  organization_id: string
  created_by?: string | null
  submitted_by?: string | null
  subject_personnel_id?: string | null
  location_id?: string | null
  division_id?: string | null
}

const ownPersonnelIds = async (organizationId: string, userId: string) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase.from('forge_personnel').select('id').eq('organization_id', organizationId).eq('auth_user_id', userId)

  return ((data || []) as { id: string }[]).map(row => row.id)
}

export const formSubmissionWithinScope = async ({
  organizationId,
  userId,
  scope,
  submission
}: {
  organizationId: string
  userId: string
  scope: string | null
  submission: FormSubmissionScopeRow
}) => {
  if (submission.organization_id !== organizationId) return false
  if (scope === 'organization') return true

  const mine = submission.created_by === userId || submission.submitted_by === userId

  if (mine) return true

  if (submission.subject_personnel_id) {
    const personnel = await ownPersonnelIds(organizationId, userId)

    if (personnel.includes(submission.subject_personnel_id)) return true
  }

  if (scope === 'own' || scope === 'assigned') return false

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') return Boolean(submission.location_id && assignments.locationIds.includes(submission.location_id))
  if (scope === 'division') return Boolean(submission.division_id && assignments.divisionIds.includes(submission.division_id))

  return false
}

/**
 * The PostgREST `or=()` filter that limits a forge_form_submissions query to a scope, or null for organization
 * scope. Location and division scopes also include your own submissions. Apply it with `query.or(filter)`;
 * callers must still filter organization_id. (Returned as a string because awaiting a query builder runs it.)
 */
export const formSubmissionScopeFilter = async ({
  organizationId,
  userId,
  scope
}: {
  organizationId: string
  userId: string
  scope: string | null
}): Promise<string | null> => {
  if (scope === 'organization') return null

  const personnel = await ownPersonnelIds(organizationId, userId)
  const ownFilters = [`created_by.eq.${userId}`, `submitted_by.eq.${userId}`, ...personnel.map(id => `subject_personnel_id.eq.${id}`)]

  if (scope === 'location' || scope === 'division') {
    const assignments = await getTenantScopeAssignments({ organizationId, userId })
    const ids = scope === 'location' ? assignments.locationIds : assignments.divisionIds
    const column = scope === 'location' ? 'location_id' : 'division_id'

    if (ids.length) ownFilters.push(`${column}.in.(${ids.join(',')})`)
  }

  return ownFilters.join(',')
}

export type LoadedFormSubmission = {
  submission: any
  template: any
  version: { id: string | null; version: number; title: string; schema: FormSchema }
}

/**
 * A submission with its template and the schema it was filled on (the pinned version, or the template's
 * working copy for drafts started before the first publish). No access check: callers check scope.
 */
export const loadFormSubmission = async ({ organizationId, submissionId }: { organizationId: string; submissionId: string }): Promise<LoadedFormSubmission | null> => {
  const supabase = createServiceRoleClient() as any

  const { data: submission } = await supabase
    .from('forge_form_submissions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) return null

  const [{ data: template }, { data: version }] = await Promise.all([
    supabase.from('forge_form_templates').select('*').eq('organization_id', organizationId).eq('id', submission.template_id).maybeSingle(),
    submission.template_version_id
      ? supabase.from('forge_form_template_versions').select('id, version, title, schema').eq('id', submission.template_version_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  if (!template) return null

  const source = version || { id: null, version: template.current_version, title: template.title, schema: template.schema }

  return {
    submission,
    template,
    version: { id: source.id, version: source.version, title: source.title, schema: normalizeFormSchema(source.schema).schema }
  }
}

/** The newest published version of a template, or null when it was never published. */
export const loadLatestTemplateVersion = async ({ organizationId, templateId }: { organizationId: string; templateId: string }) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_form_template_versions')
    .select('id, version, title, schema, published_at')
    .eq('organization_id', organizationId)
    .eq('template_id', templateId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? { ...data, schema: normalizeFormSchema(data.schema).schema } : null
}

export const formSubmissionActivity = async ({
  organizationId,
  submissionId,
  actorUserId,
  type,
  message,
  metadata = {}
}: {
  organizationId: string
  submissionId: string
  actorUserId: string | null
  type: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  const supabase = createServiceRoleClient() as any

  await supabase.from('forge_form_submission_activity').insert({
    organization_id: organizationId,
    submission_id: submissionId,
    activity_type: type,
    message,
    actor_user_id: actorUserId,
    metadata
  })
}
