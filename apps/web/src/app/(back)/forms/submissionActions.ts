'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { formSubmissionActivity, loadFormSubmission, loadLatestTemplateVersion } from '@/lib/forgeFormAccess'
import { notifyFormPendingSignature } from '@/lib/forgeFormNotify'
import type { FormField, FormSubmissionStatus, SignatureAnswer } from '@/lib/forgeFormRules'
import {
  employeeNumberFromAnswers,
  isDeferredSignatureField,
  isSignatureAnswerPresent,
  isValidSignatureImage,
  missingDirectorSignatures,
  normalizeAnswers,
  resolveSubmissionStatus,
  validateAnswers
} from '@/lib/forgeFormRules'
import { allowedPermission, canArchiveFormSubmission, canEditFormSubmission, findSubjectPersonnel } from '@/lib/forgeFormSubmissions'
import { getUserNames } from '@/lib/forgeLoto'
import { getTenantContext } from '@/lib/forgeTenantContext'

/**
 * Port slice 9: saving, submitting and archiving form submissions (1.0 industrial-domain.service
 * createFormSubmission / updateFormSubmission). Every call checks the permission and scope itself.
 *
 * Supervisor and EHS Director signatures are never written here: whatever the client sends for those fields
 * is replaced by the stored value. Signing them is a separate action.
 */

export type FieldError = { fieldId: string; message: string }

export type SaveFormSubmissionInput = {

  /** Create a new submission on this template's latest published version. */
  templateId?: string

  /** The id to give a new submission (the fill page reserves it so photos can be attached before the first save). */
  newSubmissionId?: string

  /** Update this submission. */
  submissionId?: string
  answers: Record<string, unknown>
  locationId?: string | null
  divisionId?: string | null
  mode: 'draft' | 'submit'
  expectedRowVersion?: number
}

export type SaveFormSubmissionResult =
  | { ok: true; id: string; status: FormSubmissionStatus; submissionNumber: string; rowVersion: number }
  | { ok: false; error: string; fieldErrors?: FieldError[]; conflict?: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PHOTOS_PER_FIELD = 5

const db = () => createServiceRoleClient() as any

const session = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  const access = await getEffectiveTenantAccess({ organizationId: context.activeOrganization.id, userId: context.user.id })

  return { user: context.user, organizationId: context.activeOrganization.id, access }
}

const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/**
 * Applies the signature rules to incoming answers:
 * - supervisor / EHS Director fields always keep the stored value (or stay empty);
 * - an 'any' signature identical to the stored one is kept as stored;
 * - a new 'any' signature must be a PNG data URL and is re-stamped here (time, user, in-app);
 * - an empty value clears it (the editor cleared it on purpose).
 */
const applySignatureRules = ({
  fields,
  incoming,
  stored,
  userId,
  fallbackName
}: {
  fields: FormField[]
  incoming: Record<string, unknown>
  stored: Record<string, unknown>
  userId: string
  fallbackName: string
}) => {
  const answers: Record<string, unknown> = { ...incoming }
  const errors: FieldError[] = []
  const now = new Date().toISOString()

  for (const field of fields) {
    if (field.type !== 'signature') continue

    if (isDeferredSignatureField(field)) {
      if (isSignatureAnswerPresent(stored[field.id])) answers[field.id] = stored[field.id]
      else delete answers[field.id]

      continue
    }

    const value = incoming[field.id]

    if (value == null || value === '' || (typeof value === 'object' && !isSignatureAnswerPresent(value))) {
      delete answers[field.id]
      continue
    }

    const previous = stored[field.id] as SignatureAnswer | undefined
    const image = typeof value === 'object' ? (value as Record<string, unknown>).image : null

    if (previous && typeof previous === 'object' && typeof image === 'string' && previous.image === image) {
      answers[field.id] = previous
      continue
    }

    if (typeof image !== 'string' || !isValidSignatureImage(image)) {
      delete answers[field.id]
      errors.push({ fieldId: field.id, message: `${field.label} is not a valid signature. Clear it and sign again.` })
      continue
    }

    answers[field.id] = {
      image,
      signedAt: now,
      signedByName: cleanText((value as Record<string, unknown>).signedByName, 200) || fallbackName,
      signedByUserId: userId,
      method: 'in_app'
    } satisfies SignatureAnswer
  }

  return { answers, errors }
}

/** Photo answers may only reference form photos uploaded for this submission. */
const applyPhotoRules = async ({
  fields,
  answers,
  organizationId,
  submissionId
}: {
  fields: FormField[]
  answers: Record<string, unknown>
  organizationId: string
  submissionId: string
}) => {
  const photoFields = fields.filter(field => field.type === 'photo')

  if (!photoFields.length) return []

  const { data } = await db()
    .from('forge_record_evidence')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('resource_type', 'form_submission')
    .eq('resource_id', submissionId)
    .is('archived_at', null)

  const known = new Set(((data || []) as { id: string }[]).map(row => row.id))
  const errors: FieldError[] = []

  for (const field of photoFields) {
    const list = Array.isArray(answers[field.id]) ? (answers[field.id] as unknown[]) : []
    const kept = [...new Set(list.map(String).filter(id => known.has(id)))]

    if (kept.length > MAX_PHOTOS_PER_FIELD) errors.push({ fieldId: field.id, message: `${field.label} can have at most ${MAX_PHOTOS_PER_FIELD} photos.` })
    if (field.id in answers) answers[field.id] = kept.slice(0, MAX_PHOTOS_PER_FIELD)
  }

  return errors
}

const validPlacement = async (organizationId: string, table: 'locations' | 'divisions', id: string | null | undefined) => {
  if (!id) return null
  if (!UUID.test(id)) return undefined

  const { data } = await db().from(table).select('id').eq('organization_id', organizationId).eq('id', id).maybeSingle()

  return data ? (data.id as string) : undefined
}

const STATUS_MESSAGES: Record<string, string> = {
  submitted: 'Form submitted.',
  pending_signature: 'Form submitted; waiting for a supervisor or EHS Director signature.'
}

export const saveFormSubmission = async (input: SaveFormSubmissionInput): Promise<SaveFormSubmissionResult> => {
  const auth = await session()

  if (!auth) return { ok: false, error: 'Sign in again to save this form.' }

  const { user, organizationId, access } = auth
  const mode = input.mode === 'submit' ? 'submit' : 'draft'
  const supabase = db()

  // Load what is being saved and check access.
  let existing: any = null
  let templateId: string
  let versionId: string | null
  let versionTitle: string
  let fields: FormField[]

  if (input.submissionId) {
    if (!UUID.test(input.submissionId)) return { ok: false, error: 'Form submission not found.' }

    const loaded = await loadFormSubmission({ organizationId, submissionId: input.submissionId })

    if (!loaded) return { ok: false, error: 'Form submission not found.' }

    if (!(await canEditFormSubmission({ organizationId, userId: user.id, access, submission: loaded.submission }))) {
      return { ok: false, error: loaded.submission.status === 'archived' ? 'Archived submissions cannot be edited.' : 'You cannot edit this form submission.' }
    }

    if (input.expectedRowVersion != null && Number(loaded.submission.row_version) !== Number(input.expectedRowVersion)) {
      return { ok: false, conflict: true, error: 'Someone else changed this submission. Reload it and try again.' }
    }

    existing = loaded.submission
    templateId = loaded.template.id
    versionId = loaded.version.id
    versionTitle = loaded.version.title
    fields = loaded.version.schema.fields
  } else {
    if (!allowedPermission(access, 'forms.submit')) return { ok: false, error: 'You do not have permission to fill out forms.' }
    if (!input.templateId || !UUID.test(input.templateId)) return { ok: false, error: 'Form not found.' }
    if (input.newSubmissionId && !UUID.test(input.newSubmissionId)) return { ok: false, error: 'Form not found.' }

    const { data: template } = await supabase
      .from('forge_form_templates')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('id', input.templateId)
      .maybeSingle()

    if (!template) return { ok: false, error: 'Form not found.' }
    if (template.status === 'archived') return { ok: false, error: 'This form is archived and cannot be filled out.' }

    const version = await loadLatestTemplateVersion({ organizationId, templateId: template.id })

    if (!version) return { ok: false, error: 'This form has not been published yet.' }

    templateId = template.id
    versionId = version.id
    versionTitle = version.title
    fields = version.schema.fields
  }

  const submissionId: string = existing?.id || input.newSubmissionId || randomUUID()
  const stored = (existing?.answers || {}) as Record<string, unknown>
  const names = await getUserNames({ organizationId, userIds: [user.id] })
  const fallbackName = names[user.id] || user.email || 'User'
  const raw = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers : {}

  const signed = applySignatureRules({ fields, incoming: raw, stored, userId: user.id, fallbackName })
  const answers = normalizeAnswers(fields, signed.answers)
  const photoErrors = await applyPhotoRules({ fields, answers, organizationId, submissionId })
  const final = mode === 'submit' || (existing && existing.status !== 'draft')
  const fieldErrors = [...signed.errors, ...photoErrors, ...validateAnswers(fields, answers, { final: Boolean(final) })]

  if (fieldErrors.length) return { ok: false, error: 'Fix the highlighted answers and try again.', fieldErrors }

  const current = (existing?.status || null) as FormSubmissionStatus | null
  const status = resolveSubmissionStatus(fields, answers, mode, current)

  // Subject person from the employee number answer; default the location / division from them.
  const subject = await findSubjectPersonnel({ organizationId, employeeNumber: employeeNumberFromAnswers(fields, answers) })
  const locationId = await validPlacement(organizationId, 'locations', input.locationId)
  const divisionId = await validPlacement(organizationId, 'divisions', input.divisionId)

  if (locationId === undefined) return { ok: false, error: 'Choose a valid location.' }
  if (divisionId === undefined) return { ok: false, error: 'Choose a valid division.' }

  const subjectName = subject ? `${subject.first_name} ${subject.last_name}`.trim() : ''
  const now = new Date().toISOString()
  const title = `${versionTitle} - ${subjectName || now.slice(0, 10)}`.slice(0, 300)
  const leavingDraft = status !== 'draft' && (current === null || current === 'draft')

  const values = {
    title,
    status,
    answers,
    subject_personnel_id: subject?.id || null,
    location_id: locationId || subject?.location_id || null,
    division_id: divisionId || subject?.division_id || null,
    updated_by: user.id,
    updated_at: now,
    ...(leavingDraft ? { submitted_by: user.id, submitted_at: now } : {})
  }

  let saved: any

  if (existing) {
    const { data, error } = await supabase
      .from('forge_form_submissions')
      .update({ ...values, row_version: Number(existing.row_version) + 1 })
      .eq('organization_id', organizationId)
      .eq('id', existing.id)
      .eq('row_version', existing.row_version)
      .select('id, submission_number, status, row_version')

    if (error) return { ok: false, error: 'Unable to save the form. Try again.' }
    if (!data?.length) return { ok: false, conflict: true, error: 'Someone else changed this submission. Reload it and try again.' }

    saved = data[0]
  } else {
    const { data: number, error: numberError } = await supabase.rpc('next_forge_form_submission_number', { p_organization_id: organizationId })

    if (numberError || !number) return { ok: false, error: 'Unable to number the submission. Try again.' }

    const { data, error } = await supabase
      .from('forge_form_submissions')
      .insert({
        id: submissionId,
        organization_id: organizationId,
        submission_number: number,
        template_id: templateId,
        template_version_id: versionId,
        created_by: user.id,
        ...values
      })
      .select('id, submission_number, status, row_version')
      .single()

    if (error || !data) return { ok: false, error: 'Unable to save the form. It may already have been saved; reload and try again.' }

    saved = data
  }

  const activityBase = { organizationId, submissionId: saved.id, actorUserId: user.id }

  if (!existing) {
    await formSubmissionActivity({ ...activityBase, type: 'created', message: `${versionTitle} started (${saved.submission_number}).`, metadata: { template_version_id: versionId } })
  } else if (!leavingDraft) {
    await formSubmissionActivity({ ...activityBase, type: 'saved', message: 'Answers saved.', metadata: { from_status: current, to_status: status } })
  }

  if (leavingDraft) {
    await formSubmissionActivity({ ...activityBase, type: status, message: STATUS_MESSAGES[status] || 'Form submitted.', metadata: { from_status: current } })
  }

  await writeForgeAudit({
    actorUserId: user.id,
    organizationId,
    action: existing ? (leavingDraft ? 'form_submission.submitted' : 'form_submission.saved') : leavingDraft ? 'form_submission.submitted' : 'form_submission.created',
    entityType: 'form_submission',
    entityId: saved.id,
    beforeValue: existing ? { status: existing.status, row_version: existing.row_version } : null,
    afterValue: {
      submission_number: saved.submission_number,
      status,
      template_id: templateId,
      template_version_id: versionId,
      subject_personnel_id: values.subject_personnel_id,
      location_id: values.location_id,
      division_id: values.division_id,
      row_version: saved.row_version
    }
  }).catch(() => {})

  // Ask the EHS Director to sign when a form first lands waiting for their signature.
  if (status === 'pending_signature' && current !== 'pending_signature' && missingDirectorSignatures(fields, answers).length) {
    await notifyFormPendingSignature({ organizationId, submissionId: saved.id, actorUserId: user.id }).catch(() => {})
  }

  revalidatePath('/forms/submissions')
  revalidatePath(`/forms/submissions/${saved.id}`)

  return { ok: true, id: saved.id, status: saved.status, submissionNumber: saved.submission_number, rowVersion: Number(saved.row_version) }
}

export const archiveFormSubmission = async (submissionId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
  const auth = await session()

  if (!auth) return { ok: false, error: 'Sign in again to archive this submission.' }

  const { user, organizationId, access } = auth

  if (typeof submissionId !== 'string' || !UUID.test(submissionId)) return { ok: false, error: 'Form submission not found.' }

  const { data: submission } = await db()
    .from('forge_form_submissions')
    .select('id, organization_id, status, created_by, submitted_by, subject_personnel_id, location_id, division_id, row_version, archived_at')
    .eq('organization_id', organizationId)
    .eq('id', submissionId)
    .maybeSingle()

  if (!submission) return { ok: false, error: 'Form submission not found.' }
  if (submission.status === 'archived') return { ok: false, error: 'This submission is already archived.' }

  if (!(await canArchiveFormSubmission({ organizationId, userId: user.id, access, submission }))) {
    return { ok: false, error: 'You cannot archive this form submission.' }
  }

  const now = new Date().toISOString()

  const { data, error } = await db()
    .from('forge_form_submissions')
    .update({ status: 'archived', archived_at: now, archived_by: user.id, updated_by: user.id, updated_at: now, row_version: Number(submission.row_version) + 1 })
    .eq('organization_id', organizationId)
    .eq('id', submission.id)
    .eq('row_version', submission.row_version)
    .select('id')

  if (error) return { ok: false, error: 'Unable to archive the submission. Try again.' }
  if (!data?.length) return { ok: false, error: 'Someone else changed this submission. Reload it and try again.' }

  await formSubmissionActivity({ organizationId, submissionId: submission.id, actorUserId: user.id, type: 'archived', message: 'Submission archived.', metadata: { from_status: submission.status } })
  await writeForgeAudit({
    actorUserId: user.id,
    organizationId,
    action: 'form_submission.archived',
    entityType: 'form_submission',
    entityId: submission.id,
    beforeValue: { status: submission.status },
    afterValue: { status: 'archived', archived_at: now }
  }).catch(() => {})

  revalidatePath('/forms/submissions')
  revalidatePath(`/forms/submissions/${submission.id}`)

  return { ok: true }
}
