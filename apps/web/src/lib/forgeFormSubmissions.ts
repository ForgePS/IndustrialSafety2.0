import { createServiceRoleClient } from '@repo/supabase/server'

import { formSubmissionWithinScope, formSubmissionScopeFilter } from '@/lib/forgeFormAccess'
import type { FormSubmissionStatus } from '@/lib/forgeFormRules'
import { getUserNames } from '@/lib/forgeLoto'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 9: filling forms and the submissions workspace (server only).
 * Subject lookup by employee number (1.0 form-subject.ts), who may edit a submission, the scoped list loader,
 * and the location / division options for the fill page.
 */

type PermissionLike = { permissionKey: string; allowed: boolean; scope?: string | null }
type AccessLike = { effective: PermissionLike[] }

export const allowedPermission = (access: AccessLike, key: string) =>
  access.effective.find(item => item.permissionKey === key && item.allowed) || null

export type SubjectPersonnel = {
  id: string
  first_name: string
  last_name: string
  employee_number: string | null
  location_id: string | null
  division_id: string | null
}

/** Same as SQL forge_employee_number_key: "EMP-0042", "emp 42" and "42" all match. */
export const employeeNumberKey = (raw: string | null | undefined) => {
  const value = String(raw ?? '')
    .trim()
    .replace(/^emp[-_\s]*/i, '')
    .toLowerCase()

  if (!value) return null
  if (/^[0-9]+$/.test(value)) return value.replace(/^0+/, '') || '0'

  return value
}

/** The active personnel profile with this employee number in the organization, or null. */
export const findSubjectPersonnel = async ({ organizationId, employeeNumber }: { organizationId: string; employeeNumber: string | null }) => {
  const value = employeeNumberKey(employeeNumber)

  if (!value) return null

  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_personnel')
    .select('id, first_name, last_name, employee_number, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('employee_number_key', value)
    .eq('employment_status', 'active')
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  return (data as SubjectPersonnel | null) || null
}

/**
 * Whether this user may edit (re-save) a submission: the person who created it with forms.submit within its
 * scope, or anyone with forms.edit within its scope. Archived submissions are never edited.
 */
export const canEditFormSubmission = async ({
  organizationId,
  userId,
  access,
  submission
}: {
  organizationId: string
  userId: string
  access: AccessLike
  submission: any
}) => {
  if (!submission || submission.status === 'archived' || submission.archived_at) return false

  const edit = allowedPermission(access, 'forms.edit')

  if (edit && (await formSubmissionWithinScope({ organizationId, userId, scope: edit.scope ?? null, submission }))) return true

  const submit = allowedPermission(access, 'forms.submit')

  if (submit && submission.created_by === userId) {
    return formSubmissionWithinScope({ organizationId, userId, scope: submit.scope ?? null, submission })
  }

  return false
}

export const canArchiveFormSubmission = async ({
  organizationId,
  userId,
  access,
  submission
}: {
  organizationId: string
  userId: string
  access: AccessLike
  submission: any
}) => {
  if (!submission || submission.status === 'archived' || submission.archived_at) return false

  const archive = allowedPermission(access, 'forms.archive')

  return Boolean(archive && (await formSubmissionWithinScope({ organizationId, userId, scope: archive.scope ?? null, submission })))
}

export type OrgOption = { id: string; label: string }

/** Locations and divisions a user may file a form against: all for organization scope, else their assignments. */
export const formPlacementOptions = async ({ organizationId, userId, scope }: { organizationId: string; userId: string; scope: string | null }) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: locations }, { data: divisions }, assignments] = await Promise.all([
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    scope === 'organization' ? Promise.resolve(null) : getTenantScopeAssignments({ organizationId, userId })
  ])

  const label = (item: any) => (item.code ? `${item.name} (${item.code})` : item.name)

  const keep = (rows: any[], ids: string[] | null) => (rows || []).filter(row => !ids || ids.includes(row.id)).map(row => ({ id: row.id, label: label(row) }))

  return {
    locations: keep(locations, assignments ? assignments.locationIds : null) as OrgOption[],
    divisions: keep(divisions, assignments ? assignments.divisionIds : null) as OrgOption[]
  }
}

export type FormSubmissionFilters = {
  q?: string
  status?: string
  templateId?: string
  locationId?: string
  from?: string
  to?: string
}

export type FormSubmissionListItem = {
  id: string
  submissionNumber: string
  title: string
  status: FormSubmissionStatus
  templateId: string
  templateTitle: string
  subjectName: string | null
  locationName: string | null
  submittedByName: string | null
  submittedAt: string | null
  updatedAt: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['draft', 'pending_signature', 'submitted', 'archived']

/** Submissions this user can see, newest first, with the filters applied. Archived ones only when asked for. */
export const listFormSubmissions = async ({
  organizationId,
  userId,
  scope,
  filters
}: {
  organizationId: string
  userId: string
  scope: string | null
  filters: FormSubmissionFilters
}): Promise<FormSubmissionListItem[]> => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_form_submissions')
    .select(
      'id, submission_number, title, status, template_id, subject_personnel_id, location_id, submitted_by, submitted_at, updated_at, created_by, ' +
        'forge_form_templates(title), forge_personnel(first_name, last_name), locations(name)'
    )
    .eq('organization_id', organizationId)

  if (filters.status && STATUSES.includes(filters.status)) query = query.eq('status', filters.status)
  else query = query.neq('status', 'archived')

  if (filters.templateId && /^[0-9a-f-]{36}$/i.test(filters.templateId)) query = query.eq('template_id', filters.templateId)
  if (filters.locationId && /^[0-9a-f-]{36}$/i.test(filters.locationId)) query = query.eq('location_id', filters.locationId)
  if (filters.from && DATE.test(filters.from)) query = query.gte('updated_at', `${filters.from}T00:00:00Z`)
  if (filters.to && DATE.test(filters.to)) query = query.lte('updated_at', `${filters.to}T23:59:59.999Z`)

  const scopeFilter = await formSubmissionScopeFilter({ organizationId, userId, scope })

  if (scopeFilter) query = query.or(scopeFilter)

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(500)

  if (error) throw new Error(error.message)

  // Search in memory: the scope filter already uses the query's single or=().
  const q = (filters.q || '').trim().toLowerCase().slice(0, 100)

  const rows = ((data || []) as any[]).filter(
    row => !q || String(row.submission_number).toLowerCase().includes(q) || String(row.title).toLowerCase().includes(q)
  )

  const names = await getUserNames({ organizationId, userIds: rows.map(row => row.submitted_by) })

  return rows.map(row => ({
    id: row.id,
    submissionNumber: row.submission_number,
    title: row.title,
    status: row.status,
    templateId: row.template_id,
    templateTitle: row.forge_form_templates?.title || 'Form',
    subjectName: row.forge_personnel ? `${row.forge_personnel.first_name} ${row.forge_personnel.last_name}`.trim() : null,
    locationName: row.locations?.name || null,
    submittedByName: row.submitted_by ? names[row.submitted_by] || null : null,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at
  }))
}
