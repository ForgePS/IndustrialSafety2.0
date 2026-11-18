'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { documentAccessFor, documentReachesUser, loadDocument, loadDocumentSettings, VERSION_COLUMNS, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { notifyVersionApproved, notifyVersionSentBack, notifyVersionSubmitted } from '@/lib/forgeDocumentNotify'
import { canDecideVersion } from '@/lib/forgeDocumentRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 12: the version workflow (submit, withdraw, approve, send back) and acknowledgments. Review
 * confirmation is confirmDocumentReview in ./actions.ts. Every action checks the permission, then the
 * document's scope, then calls the database RPC (which re-checks the state and writes the history row).
 * Errors from the RPCs are plain language and shown as they are.
 */

type Result = { error?: string; message?: string; nextReviewOn?: string | null }

const UUID = /^[0-9a-f-]{36}$/i
const db = () => createServiceRoleClient() as any

const refresh = (documentId: string) => {
  revalidatePath('/documents')
  revalidatePath(`/documents/${documentId}`)
  revalidatePath('/documents/approvals')
  revalidatePath('/documents/reviews')
  revalidatePath('/documents/acknowledgments')
}

const rpcError = (error: { message?: string } | null) => (error?.message || 'Something went wrong.').replace(/^.*?ERROR:\s*/, '')

/** The signed-in user with the permission, the document (in this company) and what they may do with it. */
const load = async (permissionKeys: string | string[], documentId: string) => {
  let context: DocumentContext | null = null

  for (const key of Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys]) {
    context = (await tenantPermissionOrNull(key)) as DocumentContext | null
    if (context) break
  }

  if (!context) return { error: 'You do not have permission to do that.' as const }
  if (!UUID.test(documentId || '')) return { error: 'Document not found.' as const }

  const organizationId = context.activeOrganization.id
  const doc = await loadDocument(organizationId, documentId)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access) return { error: 'Document not found.' as const }

  return { context, organizationId, userId: context.user.id, doc, access }
}

const loadVersion = async (organizationId: string, documentId: string, versionId: string) => {
  if (!UUID.test(versionId || '')) return null

  const { data } = await db()
    .from('forge_document_versions')
    .select(VERSION_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('document_id', documentId)
    .eq('id', versionId)
    .maybeSingle()

  return data as any | null
}

const audit = (organizationId: string, userId: string, action: string, versionId: string, afterValue: Record<string, unknown>, reason: string | null = null) =>
  writeForgeAudit({ actorUserId: userId, organizationId, action, entityType: 'forge_document_version', entityId: versionId, afterValue, reason })

export const submitVersion = async ({ documentId, versionId }: { documentId: string; versionId: string }): Promise<Result> => {
  const loaded = await load('documents.manage', documentId)

  if ('error' in loaded) return { error: loaded.error }

  const { organizationId, userId, doc, access } = loaded

  if (!access.manage) return { error: 'You do not have permission to submit versions of this document.' }

  const version = await loadVersion(organizationId, doc.id, versionId)

  if (!version) return { error: 'Version not found.' }

  const { error } = await db().rpc('forge_document_submit_version', { p_organization_id: organizationId, p_version_id: version.id, p_actor_user_id: userId })

  if (error) return { error: rpcError(error) }

  await audit(organizationId, userId, 'document.version_submitted', version.id, { document_id: doc.id, version_number: version.version_number, status: 'in_review' })
  await notifyVersionSubmitted({ organizationId, documentId: doc.id, versionId: version.id, actorUserId: userId })
  refresh(doc.id)

  return { message: `Version ${version.version_number} submitted for review.` }
}

export const withdrawVersion = async ({ documentId, versionId }: { documentId: string; versionId: string }): Promise<Result> => {
  const loaded = await load(['documents.manage', 'documents.approve', 'documents.view'], documentId)

  if ('error' in loaded) return { error: loaded.error }

  const { organizationId, userId, doc, access } = loaded
  const version = await loadVersion(organizationId, doc.id, versionId)

  if (!version) return { error: 'Version not found.' }

  // The submitter or a manager in scope can take a version back out of review.
  if (!access.manage && version.submitted_by !== userId) return { error: 'You do not have permission to withdraw this version.' }

  const { error } = await db().rpc('forge_document_withdraw_version', { p_organization_id: organizationId, p_version_id: version.id, p_actor_user_id: userId })

  if (error) return { error: rpcError(error) }

  await audit(organizationId, userId, 'document.version_withdrawn', version.id, { document_id: doc.id, version_number: version.version_number, status: 'draft' })
  refresh(doc.id)

  return { message: `Version ${version.version_number} withdrawn from review.` }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const approveVersion = async ({
  documentId,
  versionId,
  effectiveOn,
  note
}: {
  documentId: string
  versionId: string
  effectiveOn?: string | null
  note?: string | null
}): Promise<Result> => {
  const loaded = await load('documents.approve', documentId)

  if ('error' in loaded) return { error: loaded.error }

  const { organizationId, userId, doc, access } = loaded

  if (!access.approve) return { error: 'You do not have permission to approve this document.' }

  const version = await loadVersion(organizationId, doc.id, versionId)

  if (!version) return { error: 'Version not found.' }

  const effective = (effectiveOn || '').trim() || null

  if (effective && (!ISO_DATE.test(effective) || Number.isNaN(Date.parse(effective + 'T00:00:00Z')))) return { error: 'Enter a valid effective date.' }

  const settings = await loadDocumentSettings(organizationId)

  if (version.status === 'in_review' && !canDecideVersion(doc, version, userId, settings.allow_self_approval)) {
    return { error: 'Someone other than the person who submitted this version must approve it.' }
  }

  const cleanNote = (note || '').trim().slice(0, 2000) || null

  const { error } = await db().rpc('forge_document_approve_version', {
    p_organization_id: organizationId,
    p_version_id: version.id,
    p_actor_user_id: userId,
    p_effective_on: effective,
    p_note: cleanNote
  })

  if (error) return { error: rpcError(error) }

  const after = await loadDocument(organizationId, doc.id)

  await audit(organizationId, userId, 'document.version_approved', version.id, {
    document_id: doc.id,
    version_number: version.version_number,
    status: 'approved',
    effective_on: effective,
    review_due_on: after?.review_due_on ?? null,
    previous_version_id: doc.current_version_id
  })
  await notifyVersionApproved({ organizationId, documentId: doc.id, versionId: version.id, actorUserId: userId })
  refresh(doc.id)

  return { message: `Version ${version.version_number} approved and published.`, nextReviewOn: after?.review_due_on ?? null }
}

export const rejectVersion = async ({ documentId, versionId, reason }: { documentId: string; versionId: string; reason: string }): Promise<Result> => {
  const loaded = await load('documents.approve', documentId)

  if ('error' in loaded) return { error: loaded.error }

  const { organizationId, userId, doc, access } = loaded

  if (!access.approve) return { error: 'You do not have permission to send back versions of this document.' }

  const cleanReason = (reason || '').trim()

  if (!cleanReason) return { error: 'Give a reason for sending the version back.' }

  const version = await loadVersion(organizationId, doc.id, versionId)

  if (!version) return { error: 'Version not found.' }

  const { error } = await db().rpc('forge_document_reject_version', {
    p_organization_id: organizationId,
    p_version_id: version.id,
    p_actor_user_id: userId,
    p_reason: cleanReason.slice(0, 2000)
  })

  if (error) return { error: rpcError(error) }

  await audit(organizationId, userId, 'document.version_sent_back', version.id, { document_id: doc.id, version_number: version.version_number, status: 'draft' }, cleanReason.slice(0, 2000))
  await notifyVersionSentBack({ organizationId, documentId: doc.id, versionId: version.id, actorUserId: userId })
  refresh(doc.id)

  return { message: `Version ${version.version_number} sent back to draft.` }
}

/** Read and acknowledge the current published version of a document distributed to you. */
export const acknowledgeDocument = async ({ documentId, versionId }: { documentId: string; versionId: string }): Promise<Result> => {
  const loaded = await load('documents.view', documentId)

  if ('error' in loaded) return { error: loaded.error }

  const { organizationId, userId, doc } = loaded

  if (doc.status !== 'published' || doc.archived_at || !doc.current_version_id) return { error: 'This document is not published.' }
  if (doc.current_version_id !== versionId) return { error: 'A newer version of this document has been published. Open it again to read the current version.' }
  if (!(await documentReachesUser(doc.id, userId))) return { error: 'This document is not distributed to you.' }

  const supabase = db()

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', userId)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('forge_document_acknowledgments').insert({
    organization_id: organizationId,
    document_id: doc.id,
    version_id: versionId,
    user_id: userId,
    personnel_id: person?.id ?? null
  })

  if (error && error.code !== '23505') return { error: rpcError(error) }

  refresh(doc.id)

  return { message: 'Thanks. Your acknowledgment is recorded.' }
}
