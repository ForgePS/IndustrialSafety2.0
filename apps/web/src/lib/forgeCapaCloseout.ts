import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { createServiceRoleClient } from '@repo/supabase/server'

import { capaActivity, capaAudit, taskActivity } from '@/lib/forgeCapaCreate'
import { performAtomicCapaLifecycleTransition } from '@/lib/forgeCapaWorkflowSync'
import { storage } from '@/lib/platform/storage'

/**
 * Public CAPA closeout links (port slice 8, Industrial 1.0 corrective-action close-out link).
 *
 * Server-only. A signed-in user issues a link for one CAPA; the raw token is returned once and only its
 * sha256 hash is stored (forge_corrective_action_closeout_tokens, service role only). Anyone holding the
 * link sees a short summary of the CAPA and can submit closeout notes, their name and photos once. The
 * submission moves the CAPA to pending_verification through the same atomic lifecycle transition the
 * in-app submit uses, with no actor (the submitter is not a user), and completes the linked task.
 * Callers of issue/revoke check permission and scope; the public functions trust only the token.
 */

export const CLOSEOUT_LINK_DAYS = 90
export const CLOSEOUT_NOTES_MAX = 5000
export const CLOSEOUT_NAME_MAX = 200
export const CLOSEOUT_PHOTOS_MAX = 5
export const CLOSEOUT_PHOTO_MAX_BYTES = 10 * 1024 * 1024

const TABLE = 'forge_corrective_action_closeout_tokens'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const OPEN_STATUSES = ['open', 'in_progress']

const PHOTO_TYPES: Record<string, { ext: string; magic: (bytes: Uint8Array) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': {
    ext: 'webp',
    magic: b => String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP'
  }
}

export const CLOSEOUT_PHOTO_TYPES = Object.keys(PHOTO_TYPES)

export const hashCloseoutToken = (token: string) => createHash('sha256').update(token).digest('hex')

const newCloseoutToken = () => randomBytes(24).toString('base64url')

const db = () => createServiceRoleClient() as any

const fullName = (name: string | null | undefined) => (name && name.trim()) || 'Closeout link'

/** What a signed-in user may see about a CAPA's closeout link. Never includes the hash. */
export type CloseoutLinkState = {
  active: { id: string; createdAt: string; expiresAt: string } | null
  lastSubmission: { usedAt: string; name: string | null; notes: string | null; photoCount: number } | null
}

export const getCloseoutLinkState = async ({
  organizationId,
  correctiveActionId
}: {
  organizationId: string
  correctiveActionId: string
}): Promise<CloseoutLinkState> => {
  const { data } = await db()
    .from(TABLE)
    .select('id, created_at, expires_at, used_at, revoked_at, submitted_name, submitted_notes, submitted_photos')
    .eq('organization_id', organizationId)
    .eq('corrective_action_id', correctiveActionId)
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (data || []) as any[]
  const now = Date.now()
  const active = rows.find(row => !row.used_at && !row.revoked_at && Date.parse(row.expires_at) > now)
  const used = rows.filter(row => row.used_at).sort((a, b) => Date.parse(b.used_at) - Date.parse(a.used_at))[0]

  return {
    active: active ? { id: active.id, createdAt: active.created_at, expiresAt: active.expires_at } : null,
    lastSubmission: used
      ? {
          usedAt: used.used_at,
          name: used.submitted_name,
          notes: used.submitted_notes,
          photoCount: Array.isArray(used.submitted_photos) ? used.submitted_photos.length : 0
        }
      : null
  }
}

/** Why a CAPA cannot get a closeout link (the same prerequisites as Submit for Verification), or null. */
export const closeoutIssueBlocker = (capa: any): string | null => {
  if (!capa) return 'Corrective Action not found.'
  if (capa.archived_at) return 'Archived Corrective Actions cannot get a closeout link.'
  if (!OPEN_STATUSES.includes(capa.status)) return 'Only open or in-progress Corrective Actions can get a closeout link.'
  if (!capa.assigned_personnel_id) return 'Assign an owner before creating a closeout link.'
  if (!capa.due_at) return 'Set a due date before creating a closeout link.'
  if (!capa.action_plan) return 'Document the Corrective Action Plan before creating a closeout link.'
  if (capa.root_cause_required && !capa.root_cause) return 'Document the Root Cause before creating a closeout link.'

  return null
}

const revokeActive = async ({
  supabase,
  organizationId,
  correctiveActionId,
  actorUserId
}: {
  supabase: any
  organizationId: string
  correctiveActionId: string
  actorUserId: string | null
}) => {
  const { data } = await supabase
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString(), revoked_by: actorUserId })
    .eq('organization_id', organizationId)
    .eq('corrective_action_id', correctiveActionId)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id')

  return (data || []) as Array<{ id: string }>
}

/**
 * Issues a new closeout link for a CAPA, revoking any earlier unused link. The caller has checked the
 * permission and scope and loaded the CAPA. Returns the raw token: show it once, it is not stored.
 */
export const issueCloseoutToken = async ({
  organizationId,
  capa,
  actorUserId
}: {
  organizationId: string
  capa: any
  actorUserId: string
}): Promise<{ error: string } | { token: string; expiresAt: string }> => {
  const blocker = closeoutIssueBlocker(capa)

  if (blocker) return { error: blocker }

  const supabase = db()
  const revoked = await revokeActive({ supabase, organizationId, correctiveActionId: capa.id, actorUserId })
  const token = newCloseoutToken()
  const expiresAt = new Date(Date.now() + CLOSEOUT_LINK_DAYS * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id: organizationId,
      corrective_action_id: capa.id,
      token_hash: hashCloseoutToken(token),
      expires_at: expiresAt,
      created_by: actorUserId
    })
    .select('id')
    .single()

  if (error || !data) return { error: 'Unable to create the closeout link.' }

  await capaActivity({
    supabase,
    organizationId,
    correctiveActionId: capa.id,
    userId: actorUserId,
    type: 'closeout_link_created',
    message: 'Public closeout link created. It expires ' + expiresAt.slice(0, 10) + '.',
    metadata: { closeout_token_id: data.id, expires_at: expiresAt, revoked_token_ids: revoked.map(row => row.id) }
  })
  await capaAudit({
    supabase,
    actorUserId,
    organizationId,
    action: 'corrective_action.closeout_link_created',
    entityId: capa.id,
    after: { closeout_token_id: data.id, expires_at: expiresAt, revoked_token_ids: revoked.map(row => row.id) }
  })

  return { token, expiresAt }
}

/** Revokes the CAPA's unused closeout link(s). The caller has checked the permission and scope. */
export const revokeCloseoutToken = async ({
  organizationId,
  correctiveActionId,
  actorUserId
}: {
  organizationId: string
  correctiveActionId: string
  actorUserId: string
}): Promise<{ error?: string; revoked: number }> => {
  const supabase = db()
  const revoked = await revokeActive({ supabase, organizationId, correctiveActionId, actorUserId })

  if (!revoked.length) return { error: 'There is no active closeout link to revoke.', revoked: 0 }

  await capaActivity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: actorUserId,
    type: 'closeout_link_revoked',
    message: 'Public closeout link revoked.',
    metadata: { closeout_token_ids: revoked.map(row => row.id) }
  })
  await capaAudit({
    supabase,
    actorUserId,
    organizationId,
    action: 'corrective_action.closeout_link_revoked',
    entityId: correctiveActionId,
    after: { closeout_token_ids: revoked.map(row => row.id) }
  })

  return { revoked: revoked.length }
}

/** The only CAPA facts a link holder sees. */
export type CloseoutSummary = {
  organizationName: string
  actionNumber: string
  title: string
  description: string | null
  locationName: string | null
  dueAt: string | null
  expiresAt: string
}

export type CloseoutLookup =
  | { state: 'invalid' }
  | { state: 'expired' }
  | { state: 'revoked' }
  | { state: 'used'; usedAt: string }
  | { state: 'unavailable' }
  | { state: 'ready'; summary: CloseoutSummary }

const loadToken = async (rawToken: string) => {
  if (typeof rawToken !== 'string' || !TOKEN_PATTERN.test(rawToken)) return null

  const { data } = await db().from(TABLE).select('*').eq('token_hash', hashCloseoutToken(rawToken)).maybeSingle()

  return data as any | null
}

const tokenState = (row: any): CloseoutLookup | null => {
  if (!row) return { state: 'invalid' }
  if (row.used_at) return { state: 'used', usedAt: row.used_at }
  if (row.revoked_at) return { state: 'revoked' }
  if (Date.parse(row.expires_at) <= Date.now()) return { state: 'expired' }

  return null
}

const loadCapa = async (row: any) => {
  const { data } = await db()
    .from('forge_corrective_actions')
    .select('id, organization_id, action_number, title, description, status, due_at, archived_at, linked_task_id, locations(name), organizations(name)')
    .eq('organization_id', row.organization_id)
    .eq('id', row.corrective_action_id)
    .maybeSingle()

  return data as any | null
}

/** Resolves a raw token from a public URL. Never reveals more than CloseoutSummary. */
export const lookupCloseoutToken = async (rawToken: string): Promise<CloseoutLookup> => {
  const row = await loadToken(rawToken)
  const blocked = tokenState(row)

  if (blocked) return blocked

  const capa = await loadCapa(row)

  if (!capa || capa.archived_at || !OPEN_STATUSES.includes(capa.status)) return { state: 'unavailable' }

  return {
    state: 'ready',
    summary: {
      organizationName: capa.organizations?.name || '',
      actionNumber: capa.action_number,
      title: capa.title,
      description: capa.description || null,
      locationName: capa.locations?.name || null,
      dueAt: capa.due_at || null,
      expiresAt: row.expires_at
    }
  }
}

const LOOKUP_ERRORS: Record<string, string> = {
  invalid: 'This closeout link is not valid.',
  expired: 'This closeout link has expired. Ask your supervisor for a new one.',
  revoked: 'This closeout link was revoked. Ask your supervisor for a new one.',
  used: 'Closeout has already been submitted through this link.',
  unavailable: 'This corrective action is no longer open for closeout.'
}

export const closeoutLookupMessage = (state: CloseoutLookup['state']) => LOOKUP_ERRORS[state] || ''

export type CloseoutPhotoInput = { name: string; type: string; bytes: Uint8Array }

/** Checks the submission before anything is written. Returns an error message or null. */
export const validateCloseoutSubmission = ({
  name,
  notes,
  photos
}: {
  name: string
  notes: string
  photos: CloseoutPhotoInput[]
}): string | null => {
  if (!notes.trim()) return 'Closeout notes are required.'
  if (notes.length > CLOSEOUT_NOTES_MAX) return `Closeout notes must be ${CLOSEOUT_NOTES_MAX} characters or fewer.`
  if (name.length > CLOSEOUT_NAME_MAX) return `Your name must be ${CLOSEOUT_NAME_MAX} characters or fewer.`
  if (photos.length > CLOSEOUT_PHOTOS_MAX) return `Attach at most ${CLOSEOUT_PHOTOS_MAX} photos.`

  for (const photo of photos) {
    const type = PHOTO_TYPES[photo.type]

    if (!type || !type.magic(photo.bytes)) return 'Photos must be JPG, PNG or WebP images.'
    if (photo.bytes.byteLength < 1 || photo.bytes.byteLength > CLOSEOUT_PHOTO_MAX_BYTES) return 'Each photo must be under 10 MB.'
  }

  return null
}

/**
 * Submits closeout through a public link: claims the token (single use), stores photos as CAPA
 * evidence, moves the CAPA to pending_verification and completes the linked task.
 */
export const submitPublicCloseout = async ({
  rawToken,
  name: rawName,
  notes: rawNotes,
  photos
}: {
  rawToken: string
  name: string
  notes: string
  photos: CloseoutPhotoInput[]
}): Promise<{ ok: true; correctiveActionId: string; linkedTaskId: string | null } | { ok: false; error: string; status: number }> => {
  const name = (rawName || '').trim()
  const notes = (rawNotes || '').trim()
  const invalid = validateCloseoutSubmission({ name, notes, photos })

  if (invalid) return { ok: false, error: invalid, status: 400 }

  const row = await loadToken(rawToken)
  const blocked = tokenState(row)

  if (blocked) return { ok: false, error: closeoutLookupMessage(blocked.state), status: blocked.state === 'invalid' ? 404 : 410 }

  const capa = await loadCapa(row)

  if (!capa || capa.archived_at || !OPEN_STATUSES.includes(capa.status)) {
    return { ok: false, error: closeoutLookupMessage('unavailable'), status: 409 }
  }

  const supabase = db()
  const organizationId = row.organization_id as string
  const submitter = fullName(name)
  const now = new Date().toISOString()

  // Claim the link first so two submissions cannot both go through.
  const { data: claimed } = await supabase
    .from(TABLE)
    .update({ used_at: now, submitted_name: name || null, submitted_notes: notes })
    .eq('id', row.id)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id')

  if (!claimed?.length) return { ok: false, error: closeoutLookupMessage('used'), status: 409 }

  const release = () =>
    supabase.from(TABLE).update({ used_at: null, submitted_name: null, submitted_notes: null }).eq('id', row.id)

  const uploaded: Array<{ id: string; file_name: string; storage_path: string; content_type: string; size_bytes: number }> = []

  for (const [index, photo] of photos.entries()) {
    const id = randomUUID()
    const storagePath = organizationId + '/corrective_action/' + capa.id + '/' + id
    const { error } = await storage().upload('forge-evidence', storagePath, photo.bytes, photo.type)

    if (error) {
      if (uploaded.length) await storage().remove('forge-evidence', uploaded.map(item => item.storage_path))
      await release()

      return { ok: false, error: 'Unable to upload the photos. Try again.', status: 500 }
    }

    const safeName = (photo.name || '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || `closeout-photo-${index + 1}.${PHOTO_TYPES[photo.type].ext}`

    uploaded.push({ id, file_name: safeName, storage_path: storagePath, content_type: photo.type, size_bytes: photo.bytes.byteLength })
  }

  const transition = await performAtomicCapaLifecycleTransition({
    organizationId,
    capaId: capa.id,
    fromStatus: capa.status,
    toStatus: 'pending_verification',
    actorUserId: null,
    comment: 'Closeout submitted through the public link by ' + submitter + '.',
    capaPatch: { completed_at: now },
    metadata: { source: 'capa_public_closeout', closeout_token_id: row.id, submitted_name: submitter },
    idempotencyKey: 'capa-public-closeout-' + row.id
  })

  if (transition.error || !transition.result?.ok) {
    if (uploaded.length) await storage().remove('forge-evidence', uploaded.map(item => item.storage_path))
    await release()

    return {
      ok: false,
      error: transition.conflict ? closeoutLookupMessage('unavailable') : 'Unable to submit closeout. Try again.',
      status: transition.conflict ? 409 : 500
    }
  }

  // Photos become CAPA evidence. forge_record_evidence needs an uploader, so the person who issued the
  // link stands in; the description names the actual submitter.
  const evidenceIds: string[] = []

  if (uploaded.length && row.created_by) {
    const { data: evidence } = await supabase
      .from('forge_record_evidence')
      .insert(
        uploaded.map(item => ({
          id: item.id,
          organization_id: organizationId,
          resource_type: 'corrective_action',
          resource_id: capa.id,
          file_name: item.file_name,
          storage_path: item.storage_path,
          content_type: item.content_type,
          size_bytes: item.size_bytes,
          evidence_type: 'photo',
          description: 'Closeout photo submitted through the public link by ' + submitter + '.',
          uploaded_by: row.created_by
        }))
      )
      .select('id')

    for (const item of evidence || []) evidenceIds.push(item.id)
  }

  await supabase
    .from(TABLE)
    .update({ submitted_photos: uploaded.map(item => ({ evidence_id: evidenceIds.includes(item.id) ? item.id : null, file_name: item.file_name, storage_path: item.storage_path })) })
    .eq('id', row.id)

  const metadata = { closeout_token_id: row.id, submitted_name: submitter, photo_count: uploaded.length, evidence_ids: evidenceIds }

  await capaActivity({
    supabase,
    organizationId,
    correctiveActionId: capa.id,
    userId: null,
    type: 'public_closeout_submitted',
    message: 'Closeout submitted through the public link by ' + submitter + ': ' + notes,
    metadata
  })
  await capaAudit({
    supabase,
    actorUserId: null,
    organizationId,
    action: 'corrective_action.public_closeout_submitted',
    entityId: capa.id,
    before: { status: capa.status },
    after: { status: 'pending_verification', ...metadata }
  })

  if (capa.linked_task_id) {
    await supabase
      .from('forge_tasks')
      .update({
        status: 'completed',
        completed_at: now,
        completed_by: null,
        verification_notes: 'Corrective work completed through the closeout link by ' + submitter + '; CAPA verification pending.',
        updated_by: null,
        updated_at: now
      })
      .eq('organization_id', organizationId)
      .eq('id', capa.linked_task_id)

    await taskActivity({
      supabase,
      organizationId,
      taskId: capa.linked_task_id,
      userId: null,
      type: 'corrective_action_work_completed',
      message: 'Corrective work submitted for CAPA verification through the closeout link by ' + submitter + '.',
      metadata: { closeout_token_id: row.id }
    })
  }

  return { ok: true, correctiveActionId: capa.id, linkedTaskId: capa.linked_task_id || null }
}
