import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { formSubmissionActivity, formSubmissionWithinScope, loadFormSubmission } from '@/lib/forgeFormAccess'
import type { LoadedFormSubmission } from '@/lib/forgeFormAccess'
import {
  formatAnswer,
  isDisplayField,
  isFieldVisible,
  isSignatureAnswerPresent,
  isValidSignatureImage,
  resolveSubmissionStatus
} from '@/lib/forgeFormRules'
import type { FormField, FormSubmissionStatus, SignatureAnswer } from '@/lib/forgeFormRules'
import {
  claimSignRequest,
  createSignRequest,
  findOpenSignRequestForUser,
  getSignRequest,
  listOpenSignRequests,
  loadSignRequestByToken,
  releaseSignRequest,
  revokeOpenSignRequestsForField,
  revokeSignRequest
} from '@/lib/forgeFormSignRequests'
import type { OpenSignRequest, SignRequestRow } from '@/lib/forgeFormSignRequests'

/**
 * Port slice 9: signing form fields, in the app and through a sign link. Server only.
 *
 * 1.0 reference: platform-api/src/modules/industrial/form-signatory.ts and industrial-domain.service.ts
 * (assertEhsDirectorSignatureWritesSync, notifySafetyDirectorsOfPendingSignature, form sign links).
 *
 * Who may sign a signature field (checked here, server side, for every write):
 * - ehs_director: only a user holding forms.sign_director with a scope that covers the submission. This
 *   holds for remote links too: an EHS Director link must be opened by the requested user, signed in.
 * - supervisor: in the app, a user with forms.edit within scope, or the person an open sign request was
 *   issued to (that request is used up by the signature). Through a link, the link itself is the authority
 *   (no sign-in, the signer types their name), as in 1.0.
 * - any: signed while filling in; here only by a user with forms.edit within scope or the submission's own
 *   creator / submitter.
 * A signed field is never overwritten: clearFormSignature (forms.edit within scope, plus
 * forms.sign_director for an EHS Director field) must remove it first.
 */

const db = () => createServiceRoleClient() as any

export const SIGNER_NAME_MAX = 200

const SIGNATORY_LABEL: Record<string, string> = { supervisor: 'the supervisor', ehs_director: 'the EHS Director', any: 'the person filling in the form' }

export const waitingForLabel = (signatory: string | undefined) => 'Waiting for ' + (SIGNATORY_LABEL[signatory || 'any'] || 'a signature')

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

type Grants = Map<string, { allowed: boolean; scope: string | null }>

const loadGrants = async (organizationId: string, userId: string): Promise<Grants> => {
  const access = await getEffectiveTenantAccess({ organizationId, userId })
  const grants: Grants = new Map()

  for (const item of access.effective) grants.set(item.permissionKey, { allowed: item.allowed, scope: item.scope })

  return grants
}

const grantCovers = async (grants: Grants, key: string, organizationId: string, userId: string, submission: any) => {
  const grant = grants.get(key)

  if (!grant?.allowed) return false

  return formSubmissionWithinScope({ organizationId, userId, scope: grant.scope, submission })
}

/** Whether a user holds a forms permission with a scope that covers the submission. */
export const userHoldsFormPermission = async ({
  organizationId,
  userId,
  permissionKey,
  submission
}: {
  organizationId: string
  userId: string
  permissionKey: string
  submission: any
}) => grantCovers(await loadGrants(organizationId, userId), permissionKey, organizationId, userId, submission)

const activeMemberIds = async (organizationId: string, userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))]

  if (!ids.length) return new Set<string>()

  const { data } = await db()
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('user_id', ids)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

/**
 * Active members holding a permission (role or allow override, as getEffectiveTenantAccess resolves it)
 * with a scope that covers the submission. Same shape as getCapaVerifierIds.
 */
export const membersHoldingFormPermission = async ({
  organizationId,
  permissionKey,
  submission
}: {
  organizationId: string
  permissionKey: string
  submission: any
}): Promise<string[]> => {
  const supabase = db()
  const { data: permission } = await supabase.from('forge_permission_registry').select('id').eq('permission_key', permissionKey).maybeSingle()

  if (!permission) return []

  const [{ data: grants }, { data: overrides }] = await Promise.all([
    supabase.from('forge_tenant_role_permissions').select('role_id').eq('permission_id', permission.id).eq('allowed', true),
    supabase
      .from('forge_user_permission_overrides')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('permission_id', permission.id)
      .eq('override_state', 'allow')
  ])

  const roleIds = [...new Set<string>((grants || []).map((row: any) => row.role_id))]

  const { data: roleUsers } = roleIds.length
    ? await supabase.from('forge_tenant_user_roles').select('user_id').eq('organization_id', organizationId).in('role_id', roleIds)
    : { data: [] }

  const candidates = [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]
  const members = await activeMemberIds(organizationId, candidates)

  const checked = await Promise.all(
    [...members].map(async userId => ((await userHoldsFormPermission({ organizationId, userId, permissionKey, submission })) ? userId : null))
  )

  return checked.filter((userId): userId is string => Boolean(userId))
}

const ownPersonnelIds = async (organizationId: string, userId: string) => {
  const { data } = await db().from('forge_personnel').select('id').eq('organization_id', organizationId).eq('auth_user_id', userId)

  return ((data || []) as { id: string }[]).map(row => row.id)
}

const userNames = async (userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))]
  const names = new Map<string, { name: string | null; email: string | null }>()

  if (!ids.length) return names

  const { data } = await db().from('users').select('user_id, name, email').in('user_id', ids)

  for (const row of data || []) names.set(row.user_id, { name: row.name || null, email: row.email || null })

  return names
}

/** The name a signed-in user signs with: their profile name, else their email. */
export const signerDisplayName = async (userId: string) => {
  const entry = (await userNames([userId])).get(userId)

  return (entry?.name || entry?.email || 'Unknown user').slice(0, SIGNER_NAME_MAX)
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

const audit = async ({
  actorUserId,
  organizationId,
  action,
  submissionId,
  before,
  after
}: {
  actorUserId: string | null
  organizationId: string
  action: string
  submissionId: string
  before?: unknown
  after?: unknown
}) => {
  await db()
    .from('forge_creator_audit_log')
    .insert({
      actor_user_id: actorUserId,
      organization_id: organizationId,
      action,
      entity_type: 'form_submission',
      entity_id: submissionId,
      before_value: before ?? null,
      after_value: after ?? null
    })
}

export type SignResult =
  | { ok: true; status: FormSubmissionStatus; previousStatus: FormSubmissionStatus }
  | { ok: false; error: string; code: 'not_found' | 'forbidden' | 'invalid' | 'already_signed' | 'conflict' | 'closed' }

const fail = (code: Extract<SignResult, { ok: false }>['code'], error: string): SignResult => ({ ok: false, code, error })

const answersOf = (submission: any): Record<string, unknown> =>
  submission.answers && typeof submission.answers === 'object' && !Array.isArray(submission.answers) ? { ...submission.answers } : {}

const findSignatureField = (loaded: LoadedFormSubmission, fieldId: string) =>
  loaded.version.schema.fields.find(field => field.id === fieldId && field.type === 'signature') || null

/**
 * Why `actor` may not sign this field in the app, or null when they may. When the actor may sign only
 * because a request was issued to them, that request is returned so the caller can use it up.
 */
const inAppGate = async ({
  organizationId,
  userId,
  submission,
  field
}: {
  organizationId: string
  userId: string
  submission: any
  field: FormField
}): Promise<{ error: string } | { request: SignRequestRow | null }> => {
  const grants = await loadGrants(organizationId, userId)

  if (field.signatory === 'ehs_director') {
    return (await grantCovers(grants, 'forms.sign_director', organizationId, userId, submission))
      ? { request: null }
      : { error: 'Only an EHS Director (Sign as EHS Director permission) can sign this field.' }
  }

  if (await grantCovers(grants, 'forms.edit', organizationId, userId, submission)) return { request: null }

  if (field.signatory === 'supervisor') {
    const request = await findOpenSignRequestForUser({
      organizationId,
      submissionId: submission.id,
      fieldId: field.id,
      userId,
      personnelIds: await ownPersonnelIds(organizationId, userId)
    })

    return request ? { request } : { error: 'You are not allowed to sign the supervisor signature on this form.' }
  }

  if (submission.created_by === userId || submission.submitted_by === userId) return { request: null }

  return { error: 'You are not allowed to sign this form.' }
}

/**
 * Writes one signature into a submission's answers. Refuses fields that are missing, not signature fields,
 * hidden, or already signed, and enforces the signing rules above. A row_version guard keeps a concurrent
 * save from being overwritten (the write is retried against the fresh row). For a pending_signature or
 * submitted submission the status is recomputed (pending_signature → submitted once every deferred
 * signature is in); drafts keep their status and archived submissions cannot be signed.
 *
 * method 'remote_link' needs `signRequestId`: a request for this field that the caller has already claimed.
 */
export const signFormField = async ({
  organizationId,
  submissionId,
  fieldId,
  image,
  signerName,
  actor,
  method,
  signRequestId = null
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  image: string
  signerName: string
  actor: { userId: string } | null
  method: SignatureAnswer['method']
  signRequestId?: string | null
}): Promise<SignResult> => {
  if (method === 'imported') return fail('invalid', 'Imported signatures are written by the form import.')
  if (!isValidSignatureImage(image)) return fail('invalid', 'Draw a signature first (PNG, under 300 KB).')

  const name = String(signerName || '').trim().slice(0, SIGNER_NAME_MAX)

  if (!name) return fail('invalid', 'Enter the signer’s name.')

  let claimedInApp: string | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadFormSubmission({ organizationId, submissionId })

    if (!loaded) return fail('not_found', 'Form submission not found.')

    const { submission } = loaded
    const current = submission.status as FormSubmissionStatus

    if (current === 'archived' || submission.archived_at) return fail('closed', 'Archived submissions cannot be signed.')

    const field = findSignatureField(loaded, fieldId)

    if (!field) return fail('invalid', 'That signature field is not on this form.')

    const answers = answersOf(submission)

    if (!isFieldVisible(field, answers)) return fail('invalid', `${field.label} is not shown on this form, so it cannot be signed.`)
    if (isSignatureAnswerPresent(answers[field.id])) return fail('already_signed', `${field.label} is already signed.`)

    // Authorization (re-checked on every attempt; it is cheap next to a lost signature).
    if (method === 'remote_link') {
      const request = signRequestId ? await getSignRequest(signRequestId) : null

      if (
        !request ||
        request.organization_id !== organizationId ||
        request.submission_id !== submissionId ||
        request.field_id !== field.id ||
        !request.used_at ||
        request.revoked_at
      ) {
        return fail('forbidden', 'This signature link is not valid for this field.')
      }

      if (field.signatory === 'ehs_director') {
        if (!actor || actor.userId !== request.requested_for_user_id) {
          return fail('forbidden', 'Sign in as the EHS Director this link was sent to.')
        }

        if (!(await userHoldsFormPermission({ organizationId, userId: actor.userId, permissionKey: 'forms.sign_director', submission }))) {
          return fail('forbidden', 'Only an EHS Director (Sign as EHS Director permission) can sign this field.')
        }
      }
    } else {
      if (!actor) return fail('forbidden', 'Sign in to sign this form.')

      const gate = await inAppGate({ organizationId, userId: actor.userId, submission, field })

      if ('error' in gate) return fail('forbidden', gate.error)

      if (gate.request && !claimedInApp) {
        if (!(await claimSignRequest(gate.request.id))) return fail('conflict', 'Your signature request was just used or cancelled. Reload and try again.')
        claimedInApp = gate.request.id
      }
    }

    const signature: SignatureAnswer = {
      image,
      signedAt: new Date().toISOString(),
      signedByName: name,
      signedByUserId: actor?.userId || null,
      method
    }

    const nextAnswers = { ...answers, [field.id]: signature }
    const fields = loaded.version.schema.fields
    const status = current === 'pending_signature' || current === 'submitted' ? resolveSubmissionStatus(fields, nextAnswers, 'submit', current) : current
    const now = signature.signedAt

    const patch: Record<string, unknown> = {
      answers: nextAnswers,
      status,
      row_version: Number(submission.row_version) + 1,
      updated_by: actor?.userId || null,
      updated_at: now
    }

    if (status === 'submitted' && !submission.submitted_at) patch.submitted_at = now

    const { data: updated, error } = await db()
      .from('forge_form_submissions')
      .update(patch)
      .eq('organization_id', organizationId)
      .eq('id', submissionId)
      .eq('row_version', submission.row_version)
      .select('id')

    if (error) {
      if (claimedInApp) await releaseSignRequest(claimedInApp)

      return fail('conflict', 'Unable to save the signature. Try again.')
    }

    if (!updated?.length) continue

    const usedRequestId = signRequestId || claimedInApp
    const revoked = await revokeOpenSignRequestsForField({ organizationId, submissionId, fieldId: field.id, exceptId: usedRequestId })
    const how = method === 'remote_link' ? 'through a sign link' : 'in the app'
    const statusNote = status !== current ? ` The form is now ${status === 'submitted' ? 'submitted' : status.replace('_', ' ')}.` : ''

    const metadata = {
      field_id: field.id,
      field_label: field.label,
      signatory: field.signatory || 'any',
      method,
      signed_by_name: name,
      signed_by_user_id: actor?.userId || null,
      sign_request_id: usedRequestId,
      revoked_request_ids: revoked,
      from_status: current,
      to_status: status
    }

    await formSubmissionActivity({
      organizationId,
      submissionId,
      actorUserId: actor?.userId || null,
      type: 'signed',
      message: `${field.label} signed by ${name} ${how}.${statusNote}`,
      metadata
    })
    await audit({ actorUserId: actor?.userId || null, organizationId, action: 'form_submission.signed', submissionId, before: { status: current }, after: metadata })

    return { ok: true, status, previousStatus: current }
  }

  if (claimedInApp) await releaseSignRequest(claimedInApp)

  return fail('conflict', 'The form changed while you were signing. Reload and try again.')
}

/**
 * Removes a signature so it can be signed again. Needs forms.edit within scope, plus forms.sign_director for
 * an EHS Director field. A submitted form whose deferred signature is cleared goes back to pending_signature.
 */
export const clearFormSignature = async ({
  organizationId,
  submissionId,
  fieldId,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  actorUserId: string
}): Promise<SignResult> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadFormSubmission({ organizationId, submissionId })

    if (!loaded) return fail('not_found', 'Form submission not found.')

    const { submission } = loaded
    const current = submission.status as FormSubmissionStatus

    if (current === 'archived' || submission.archived_at) return fail('closed', 'Archived submissions cannot be changed.')

    const field = findSignatureField(loaded, fieldId)

    if (!field) return fail('invalid', 'That signature field is not on this form.')

    const grants = await loadGrants(organizationId, actorUserId)

    if (!(await grantCovers(grants, 'forms.edit', organizationId, actorUserId, submission))) {
      return fail('forbidden', 'You need permission to edit this submission to clear a signature.')
    }

    if (field.signatory === 'ehs_director' && !(await grantCovers(grants, 'forms.sign_director', organizationId, actorUserId, submission))) {
      return fail('forbidden', 'Only an EHS Director can clear the EHS Director signature.')
    }

    const answers = answersOf(submission)
    const previous = answers[field.id]

    if (!isSignatureAnswerPresent(previous)) return fail('invalid', `${field.label} is not signed.`)

    delete answers[field.id]

    const status = current === 'pending_signature' || current === 'submitted' ? resolveSubmissionStatus(loaded.version.schema.fields, answers, 'submit', current) : current
    const now = new Date().toISOString()

    const { data: updated, error } = await db()
      .from('forge_form_submissions')
      .update({ answers, status, row_version: Number(submission.row_version) + 1, updated_by: actorUserId, updated_at: now })
      .eq('organization_id', organizationId)
      .eq('id', submissionId)
      .eq('row_version', submission.row_version)
      .select('id')

    if (error) return fail('conflict', 'Unable to clear the signature. Try again.')
    if (!updated?.length) continue

    const before = previous as Partial<SignatureAnswer>

    const metadata = {
      field_id: field.id,
      field_label: field.label,
      signatory: field.signatory || 'any',
      previous_signed_by_name: before.signedByName || null,
      previous_signed_at: before.signedAt || null,
      previous_method: before.method || null,
      from_status: current,
      to_status: status
    }

    await formSubmissionActivity({
      organizationId,
      submissionId,
      actorUserId,
      type: 'signature_cleared',
      message: `${field.label} signature (by ${before.signedByName || 'unknown'}) was cleared.`,
      metadata
    })
    await audit({ actorUserId, organizationId, action: 'form_submission.signature_cleared', submissionId, before: { status: current }, after: metadata })

    return { ok: true, status, previousStatus: current }
  }

  return fail('conflict', 'The form changed while you were clearing the signature. Reload and try again.')
}

// ---------------------------------------------------------------------------
// Sign requests (links)
// ---------------------------------------------------------------------------

export type EligibleSigner = {
  key: string
  name: string
  detail: string | null
  userId: string | null
  personnelId: string | null
}

/**
 * Who a sign link may be sent to. Supervisor field: active personnel at the submission's location, members
 * with access to that location, and members with forms.edit covering the submission. EHS Director field:
 * members holding forms.sign_director covering the submission (they must sign in, so a login is required).
 */
export const listEligibleSigners = async ({
  organizationId,
  submission,
  field
}: {
  organizationId: string
  submission: any
  field: FormField
}): Promise<EligibleSigner[]> => {
  const supabase = db()

  if (field.signatory === 'ehs_director') {
    const ids = await membersHoldingFormPermission({ organizationId, permissionKey: 'forms.sign_director', submission })
    const names = await userNames(ids)

    return ids
      .map(id => ({ key: 'user:' + id, name: names.get(id)?.name || names.get(id)?.email || 'Unknown user', detail: names.get(id)?.email || null, userId: id, personnelId: null }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  if (field.signatory !== 'supervisor') return []

  const [editors, personnelRows, locationUsers] = await Promise.all([
    membersHoldingFormPermission({ organizationId, permissionKey: 'forms.edit', submission }),
    submission.location_id
      ? supabase
          .from('forge_personnel')
          .select('id, first_name, last_name, auth_user_id, job_title, employment_status')
          .eq('organization_id', organizationId)
          .eq('location_id', submission.location_id)
          .is('archived_at', null)
          .order('last_name')
          .limit(500)
          .then((result: any) => (result.data || []) as any[])
      : Promise.resolve([] as any[]),
    submission.location_id
      ? supabase
          .from('forge_tenant_user_location_access')
          .select('user_id')
          .eq('organization_id', organizationId)
          .eq('location_id', submission.location_id)
          .then((result: any) => ((result.data || []) as any[]).map(row => row.user_id as string))
      : Promise.resolve([] as string[])
  ])

  const activeLocationUsers = [...(await activeMemberIds(organizationId, locationUsers as string[]))]
  const personnel = (personnelRows as any[]).filter((row: any) => String(row.employment_status || 'active').toLowerCase() === 'active')
  const userIds = [...new Set([...editors, ...activeLocationUsers])]
  const names = await userNames(userIds)
  const signers: EligibleSigner[] = []
  const coveredUsers = new Set<string>()

  for (const row of personnel) {
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed person'

    if (row.auth_user_id) coveredUsers.add(row.auth_user_id)
    signers.push({ key: 'personnel:' + row.id, name, detail: row.job_title || null, userId: row.auth_user_id || null, personnelId: row.id })
  }

  for (const id of userIds) {
    if (coveredUsers.has(id)) continue

    const entry = names.get(id)

    signers.push({ key: 'user:' + id, name: entry?.name || entry?.email || 'Unknown user', detail: entry?.email || null, userId: id, personnelId: null })
  }

  return signers.sort((a, b) => a.name.localeCompare(b.name))
}

/** Loads a submission and one deferred signature field for the request flows, with the edit check. */
const loadForRequest = async ({
  organizationId,
  submissionId,
  fieldId,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  actorUserId: string
}): Promise<{ error: string } | { loaded: LoadedFormSubmission; field: FormField }> => {
  const loaded = await loadFormSubmission({ organizationId, submissionId })

  if (!loaded) return { error: 'Form submission not found.' }

  if (!(await userHoldsFormPermission({ organizationId, userId: actorUserId, permissionKey: 'forms.edit', submission: loaded.submission }))) {
    return { error: 'You need permission to edit this submission to send a signature link.' }
  }

  const field = findSignatureField(loaded, fieldId)

  if (!field || (field.signatory !== 'supervisor' && field.signatory !== 'ehs_director')) {
    return { error: 'Links can be sent only for supervisor and EHS Director signatures.' }
  }

  return { loaded, field }
}

export const listEligibleSignersForField = async ({
  organizationId,
  submissionId,
  fieldId,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  actorUserId: string
}): Promise<{ error: string } | { signers: EligibleSigner[] }> => {
  const found = await loadForRequest({ organizationId, submissionId, fieldId, actorUserId })

  if ('error' in found) return found

  return { signers: await listEligibleSigners({ organizationId, submission: found.loaded.submission, field: found.field }) }
}

/**
 * Issues a sign link for an unsigned supervisor or EHS Director field of a pending_signature submission, to
 * someone from listEligibleSigners (picked by key). Replaces any open link for the same field. Returns the
 * raw token once; notify the signer with notifyFormSignRequest.
 */
export const issueFormSignRequest = async ({
  organizationId,
  submissionId,
  fieldId,
  signerKey,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  signerKey: string
  actorUserId: string
}): Promise<{ error: string } | { requestId: string; token: string; expiresAt: string; signer: EligibleSigner }> => {
  const found = await loadForRequest({ organizationId, submissionId, fieldId, actorUserId })

  if ('error' in found) return found

  const { loaded, field } = found
  const { submission } = loaded

  if (submission.status !== 'pending_signature' || submission.archived_at) return { error: 'Only forms that need a signature can get a signature link.' }

  const answers = answersOf(submission)

  if (!isFieldVisible(field, answers)) return { error: `${field.label} is not shown on this form.` }
  if (isSignatureAnswerPresent(answers[field.id])) return { error: `${field.label} is already signed.` }

  const signers = await listEligibleSigners({ organizationId, submission, field })
  const signer = signers.find(item => item.key === signerKey)

  if (!signer) return { error: 'Choose someone from the list of people who can sign this field.' }
  if (field.signatory === 'ehs_director' && !signer.userId) return { error: 'An EHS Director link must go to a user who can sign in.' }

  const created = await createSignRequest({
    organizationId,
    submissionId,
    fieldId: field.id,
    requestedForUserId: signer.userId,
    requestedForPersonnelId: signer.personnelId,
    requestedForName: signer.name,
    requestedBy: actorUserId
  })

  if ('error' in created) return created

  const metadata = {
    field_id: field.id,
    field_label: field.label,
    signatory: field.signatory,
    sign_request_id: created.id,
    requested_for_name: signer.name,
    requested_for_user_id: signer.userId,
    requested_for_personnel_id: signer.personnelId,
    expires_at: created.expiresAt,
    replaced_request_ids: created.replacedIds
  }

  await formSubmissionActivity({
    organizationId,
    submissionId,
    actorUserId,
    type: 'sign_request_created',
    message: `Signature link for ${field.label} sent to ${signer.name}. It expires ${created.expiresAt.slice(0, 10)}.`,
    metadata
  })
  await audit({ actorUserId, organizationId, action: 'form_submission.sign_request_created', submissionId, after: metadata })

  return { requestId: created.id, token: created.token, expiresAt: created.expiresAt, signer }
}

export const revokeFormSignRequest = async ({
  organizationId,
  submissionId,
  requestId,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  requestId: string
  actorUserId: string
}): Promise<{ error?: string }> => {
  const loaded = await loadFormSubmission({ organizationId, submissionId })

  if (!loaded) return { error: 'Form submission not found.' }

  if (!(await userHoldsFormPermission({ organizationId, userId: actorUserId, permissionKey: 'forms.edit', submission: loaded.submission }))) {
    return { error: 'You need permission to edit this submission to cancel a signature link.' }
  }

  const row = await revokeSignRequest({ organizationId, submissionId, requestId })

  if (!row) return { error: 'That signature link is no longer open.' }

  const label = loaded.version.schema.fields.find(field => field.id === row.field_id)?.label || row.field_id
  const metadata = { sign_request_id: row.id, field_id: row.field_id, field_label: label, requested_for_name: row.requested_for_name }

  await formSubmissionActivity({
    organizationId,
    submissionId,
    actorUserId,
    type: 'sign_request_revoked',
    message: `Signature link for ${label} (${row.requested_for_name || 'unnamed'}) was cancelled.`,
    metadata
  })
  await audit({ actorUserId, organizationId, action: 'form_submission.sign_request_revoked', submissionId, after: metadata })

  return {}
}

// ---------------------------------------------------------------------------
// Remote signing (public /sign/[token])
// ---------------------------------------------------------------------------

export type SignLinkState = 'invalid' | 'expired' | 'revoked' | 'used' | 'signed' | 'unavailable'

const LINK_MESSAGES: Record<SignLinkState, string> = {
  invalid: 'This signature link is not valid.',
  expired: 'This signature link has expired. Ask the person who sent it for a new one.',
  revoked: 'This signature link was cancelled. Ask the person who sent it for a new one.',
  used: 'This signature link has already been used.',
  signed: 'This signature has already been given.',
  unavailable: 'This form is no longer waiting for this signature.'
}

export const signLinkMessage = (state: SignLinkState) => LINK_MESSAGES[state]

export type SignLinkSummary = {
  requestId: string
  organizationId: string
  submissionId: string
  organizationName: string
  formTitle: string
  submissionNumber: string
  field: { id: string; label: string; signatory: 'supervisor' | 'ehs_director' }
  requestedForName: string | null
  requestedForUserId: string | null
  expiresAt: string
  answers: { label: string; value: string }[]
}

export type SignLinkLookup = { state: SignLinkState } | { state: 'ready'; summary: SignLinkSummary }

/** Resolves a raw token. Reveals only the summary a signer needs: company, form, number, answers, field. */
export const lookupSignLink = async (rawToken: string): Promise<SignLinkLookup> => {
  const found = await loadSignRequestByToken(rawToken)

  if (found.state !== 'open') return { state: found.state }

  const { row } = found
  const loaded = await loadFormSubmission({ organizationId: row.organization_id, submissionId: row.submission_id })

  if (!loaded || loaded.submission.archived_at || loaded.submission.status !== 'pending_signature') return { state: 'unavailable' }

  const field = findSignatureField(loaded, row.field_id)
  const answers = answersOf(loaded.submission)

  if (!field || (field.signatory !== 'supervisor' && field.signatory !== 'ehs_director') || !isFieldVisible(field, answers)) return { state: 'unavailable' }
  if (isSignatureAnswerPresent(answers[field.id])) return { state: 'signed' }

  const { data: organization } = await db().from('organizations').select('name').eq('id', row.organization_id).maybeSingle()

  const list = loaded.version.schema.fields
    .filter(item => !isDisplayField(item) && item.id !== field.id && isFieldVisible(item, answers))
    .map(item => ({ label: item.label, value: formatAnswer(item, answers[item.id]) }))

  return {
    state: 'ready',
    summary: {
      requestId: row.id,
      organizationId: row.organization_id,
      submissionId: row.submission_id,
      organizationName: organization?.name || '',
      formTitle: loaded.submission.title || loaded.version.title,
      submissionNumber: loaded.submission.submission_number,
      field: { id: field.id, label: field.label, signatory: field.signatory },
      requestedForName: row.requested_for_name,
      requestedForUserId: row.requested_for_user_id,
      expiresAt: row.expires_at,
      answers: list
    }
  }
}

const HTTP_FOR_STATE: Record<SignLinkState, number> = { invalid: 404, expired: 410, revoked: 410, used: 409, signed: 409, unavailable: 409 }

/**
 * Signs through a link. Supervisor link: no sign-in needed, the signer types their name. EHS Director link:
 * `userId` must be the requested user and hold forms.sign_director (signFormField re-checks). The link is
 * claimed before the signature is written and released if the write fails.
 */
export const signWithLink = async ({
  rawToken,
  name: rawName,
  image,
  userId
}: {
  rawToken: string
  name: string
  image: string
  userId: string | null
}): Promise<{ ok: true; submissionId: string; status: FormSubmissionStatus } | { ok: false; error: string; status: number }> => {
  const lookup = await lookupSignLink(rawToken)

  if (lookup.state !== 'ready') return { ok: false, error: signLinkMessage(lookup.state), status: HTTP_FOR_STATE[lookup.state] }

  const { summary } = lookup
  const director = summary.field.signatory === 'ehs_director'

  if (director) {
    if (!userId) return { ok: false, error: 'Sign in to sign as the EHS Director.', status: 401 }
    if (userId !== summary.requestedForUserId) return { ok: false, error: 'This link was sent to another user. Sign in as ' + (summary.requestedForName || 'the requested EHS Director') + '.', status: 403 }
  }

  const name = director ? await signerDisplayName(userId as string) : String(rawName || '').trim()

  if (!name) return { ok: false, error: 'Enter your name.', status: 400 }
  if (name.length > SIGNER_NAME_MAX) return { ok: false, error: `Your name must be ${SIGNER_NAME_MAX} characters or fewer.`, status: 400 }
  if (!isValidSignatureImage(image)) return { ok: false, error: 'Draw your signature first.', status: 400 }

  if (!(await claimSignRequest(summary.requestId))) return { ok: false, error: signLinkMessage('used'), status: 409 }

  // A signed-in supervisor is recorded only when they are the person the link was sent to.
  const actorId = director ? userId : userId && userId === summary.requestedForUserId ? userId : null

  const result = await signFormField({
    organizationId: summary.organizationId,
    submissionId: summary.submissionId,
    fieldId: summary.field.id,
    image,
    signerName: name,
    actor: actorId ? { userId: actorId } : null,
    method: 'remote_link',
    signRequestId: summary.requestId
  })

  if (!result.ok) {
    await releaseSignRequest(summary.requestId)

    const status = result.code === 'forbidden' ? 403 : result.code === 'invalid' ? 400 : result.code === 'not_found' ? 404 : 409

    return { ok: false, error: result.error, status }
  }

  return { ok: true, submissionId: summary.submissionId, status: result.status }
}

// ---------------------------------------------------------------------------
// Panel data
// ---------------------------------------------------------------------------

export type SignaturePanelField = {
  id: string
  label: string
  signatory: 'supervisor' | 'ehs_director'
  signed: { name: string; at: string; method: string; image: string | null } | null
  waitingFor: string
  canSign: boolean
  canClear: boolean
  canRequest: boolean
  openRequests: OpenSignRequest[]
}

export type SignaturePanelData = {
  submissionId: string
  status: FormSubmissionStatus
  viewerName: string
  fields: SignaturePanelField[]
}

/**
 * Everything the signature panel shows a viewer: deferred signature fields with status and what the viewer
 * may do. Null when the viewer may neither view the submission nor sign any of its fields.
 */
export const getSignaturePanelData = async ({
  organizationId,
  userId,
  submissionId
}: {
  organizationId: string
  userId: string
  submissionId: string
}): Promise<SignaturePanelData | null> => {
  const loaded = await loadFormSubmission({ organizationId, submissionId })

  if (!loaded) return null

  const { submission } = loaded
  const status = submission.status as FormSubmissionStatus
  const answers = answersOf(submission)
  const grants = await loadGrants(organizationId, userId)

  const [canView, canEdit, isDirector, personnelIds] = await Promise.all([
    grantCovers(grants, 'forms.view', organizationId, userId, submission),
    grantCovers(grants, 'forms.edit', organizationId, userId, submission),
    grantCovers(grants, 'forms.sign_director', organizationId, userId, submission),
    ownPersonnelIds(organizationId, userId)
  ])

  const deferred = loaded.version.schema.fields.filter(
    (field): field is FormField & { signatory: 'supervisor' | 'ehs_director' } =>
      field.type === 'signature' && (field.signatory === 'supervisor' || field.signatory === 'ehs_director') && isFieldVisible(field, answers)
  )

  if (!deferred.length) return null

  const open = await listOpenSignRequests({ organizationId, submissionId })
  const closed = status === 'archived' || Boolean(submission.archived_at)

  const fields = deferred.map(field => {
    const answer = answers[field.id]
    const signed = isSignatureAnswerPresent(answer) ? (answer as Partial<SignatureAnswer>) : null
    const requests = open.filter(request => request.fieldId === field.id)
    const requestedToMe = requests.some(request => request.requestedForUserId === userId)
    const canSign = !closed && !signed && (field.signatory === 'ehs_director' ? isDirector : canEdit || requestedToMe)

    return {
      id: field.id,
      label: field.label,
      signatory: field.signatory,
      signed: signed
        ? {
            name: String(signed.signedByName || 'Unknown'),
            at: String(signed.signedAt || ''),
            method: String(signed.method || ''),
            image: typeof signed.image === 'string' && isValidSignatureImage(signed.image) ? signed.image : null
          }
        : null,
      waitingFor: waitingForLabel(field.signatory),
      canSign,
      canClear: !closed && Boolean(signed) && canEdit && (field.signatory !== 'ehs_director' || isDirector),
      canRequest: !closed && !signed && canEdit && status === 'pending_signature',
      openRequests: canEdit ? requests : []
    }
  })

  // A request sent to one of the viewer's personnel profiles also lets them sign (signFormField re-checks).
  if (personnelIds.length) {
    for (const field of fields) {
      if (field.canSign || field.signed || closed || field.signatory !== 'supervisor') continue

      const request = await findOpenSignRequestForUser({ organizationId, submissionId, fieldId: field.id, userId, personnelIds })

      if (request) field.canSign = true
    }
  }

  if (!canView && !fields.some(field => field.canSign)) return null

  return { submissionId, status, viewerName: await signerDisplayName(userId), fields }
}
