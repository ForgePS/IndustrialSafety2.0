import { createHash, randomBytes } from 'node:crypto'

import { createServiceRoleClient } from '@repo/supabase/server'

/**
 * Port slice 9: remote "send a link to sign" requests for supervisor and EHS Director signature fields
 * (Industrial 1.0 industrial-domain.service.ts sendFormSignLink). Server only, low level: issue, list,
 * revoke, look up and claim. Permission and scope checks live in the callers (forgeFormSigning.ts and the
 * signing server actions).
 *
 * The raw token is 24 random bytes (base64url, 32 characters), returned once to the person who issued it;
 * forge_form_sign_requests keeps only its sha256 hex. A request is single use: it is claimed by a
 * conditional update (used_at is null, not revoked, not expired) before the signature is written, and
 * released again if writing the signature fails.
 */

export const SIGN_LINK_DAYS = 14

const TABLE = 'forge_form_sign_requests'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

const db = () => createServiceRoleClient() as any

export const hashSignToken = (token: string) => createHash('sha256').update(token).digest('hex')

const newSignToken = () => randomBytes(24).toString('base64url')

export const signLinkPath = (token: string) => '/sign/' + token

export type SignRequestRow = {
  id: string
  organization_id: string
  submission_id: string
  field_id: string
  requested_for_personnel_id: string | null
  requested_for_user_id: string | null
  requested_for_name: string | null
  requested_by: string | null
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  created_at: string
}

/** What a signed-in user sees about an open request. Never includes the hash. */
export type OpenSignRequest = {
  id: string
  fieldId: string
  requestedForName: string | null
  requestedForUserId: string | null
  createdAt: string
  expiresAt: string
}

const isOpen = (row: SignRequestRow, now = Date.now()) => !row.used_at && !row.revoked_at && Date.parse(row.expires_at) > now

export const listOpenSignRequests = async ({
  organizationId,
  submissionId
}: {
  organizationId: string
  submissionId: string
}): Promise<OpenSignRequest[]> => {
  const { data } = await db()
    .from(TABLE)
    .select('id, field_id, requested_for_name, requested_for_user_id, created_at, expires_at, used_at, revoked_at')
    .eq('organization_id', organizationId)
    .eq('submission_id', submissionId)
    .is('used_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  return ((data || []) as SignRequestRow[])
    .filter(row => isOpen(row))
    .map(row => ({
      id: row.id,
      fieldId: row.field_id,
      requestedForName: row.requested_for_name,
      requestedForUserId: row.requested_for_user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    }))
}

/** Open requests issued to a user (directly or through their personnel profiles) for one field. */
export const findOpenSignRequestForUser = async ({
  organizationId,
  submissionId,
  fieldId,
  userId,
  personnelIds
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  userId: string
  personnelIds: string[]
}): Promise<SignRequestRow | null> => {
  const filters = [`requested_for_user_id.eq.${userId}`, ...personnelIds.map(id => `requested_for_personnel_id.eq.${id}`)]

  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('organization_id', organizationId)
    .eq('submission_id', submissionId)
    .eq('field_id', fieldId)
    .is('used_at', null)
    .is('revoked_at', null)
    .or(filters.join(','))
    .order('created_at', { ascending: false })

  return ((data || []) as SignRequestRow[]).find(row => isOpen(row)) || null
}

/** Revokes every open request for a field (a new request replaces them; a signature makes them moot). */
export const revokeOpenSignRequestsForField = async ({
  organizationId,
  submissionId,
  fieldId,
  exceptId = null
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  exceptId?: string | null
}) => {
  let query = db()
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('submission_id', submissionId)
    .eq('field_id', fieldId)
    .is('used_at', null)
    .is('revoked_at', null)

  if (exceptId) query = query.neq('id', exceptId)

  const { data } = await query.select('id')

  return ((data || []) as { id: string }[]).map(row => row.id)
}

/**
 * Stores a new request (replacing any open one for the same field). The caller has checked permission,
 * scope and that the signer is eligible. Returns the raw token once.
 */
export const createSignRequest = async ({
  organizationId,
  submissionId,
  fieldId,
  requestedForUserId,
  requestedForPersonnelId,
  requestedForName,
  requestedBy
}: {
  organizationId: string
  submissionId: string
  fieldId: string
  requestedForUserId: string | null
  requestedForPersonnelId: string | null
  requestedForName: string
  requestedBy: string
}): Promise<{ error: string } | { id: string; token: string; expiresAt: string; replacedIds: string[] }> => {
  const replacedIds = await revokeOpenSignRequestsForField({ organizationId, submissionId, fieldId })
  const token = newSignToken()
  const expiresAt = new Date(Date.now() + SIGN_LINK_DAYS * 86_400_000).toISOString()

  const { data, error } = await db()
    .from(TABLE)
    .insert({
      organization_id: organizationId,
      submission_id: submissionId,
      field_id: fieldId,
      token_hash: hashSignToken(token),
      requested_for_user_id: requestedForUserId,
      requested_for_personnel_id: requestedForPersonnelId,
      requested_for_name: requestedForName.slice(0, 200) || null,
      requested_by: requestedBy,
      expires_at: expiresAt
    })
    .select('id')
    .single()

  if (error || !data) return { error: 'Unable to create the signature link.' }

  return { id: data.id as string, token, expiresAt, replacedIds }
}

/** Revokes one open request. Returns the revoked row, or null when it was not open. */
export const revokeSignRequest = async ({
  organizationId,
  submissionId,
  requestId
}: {
  organizationId: string
  submissionId: string
  requestId: string
}): Promise<SignRequestRow | null> => {
  const { data } = await db()
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('submission_id', submissionId)
    .eq('id', requestId)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('*')

  return ((data || []) as SignRequestRow[])[0] || null
}

export type SignTokenState = 'invalid' | 'expired' | 'revoked' | 'used'

/** The request behind a raw token, or why it cannot be used. */
export const loadSignRequestByToken = async (rawToken: string): Promise<{ state: SignTokenState } | { state: 'open'; row: SignRequestRow }> => {
  if (typeof rawToken !== 'string' || !TOKEN_PATTERN.test(rawToken)) return { state: 'invalid' }

  const { data } = await db().from(TABLE).select('*').eq('token_hash', hashSignToken(rawToken)).maybeSingle()
  const row = data as SignRequestRow | null

  if (!row) return { state: 'invalid' }
  if (row.used_at) return { state: 'used' }
  if (row.revoked_at) return { state: 'revoked' }
  if (Date.parse(row.expires_at) <= Date.now()) return { state: 'expired' }

  return { state: 'open', row }
}

/** Marks a request used, only if it is still open. True when this call claimed it. */
export const claimSignRequest = async (requestId: string) => {
  const now = new Date().toISOString()

  const { data } = await db()
    .from(TABLE)
    .update({ used_at: now })
    .eq('id', requestId)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id')

  return Boolean(data?.length)
}

/** Undoes a claim when the signature could not be written. */
export const releaseSignRequest = async (requestId: string) => {
  await db().from(TABLE).update({ used_at: null }).eq('id', requestId)
}

/** A request row by id (for re-checking a claimed request). */
export const getSignRequest = async (requestId: string): Promise<SignRequestRow | null> => {
  const { data } = await db().from(TABLE).select('*').eq('id', requestId).maybeSingle()

  return (data as SignRequestRow | null) || null
}
