'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import {
  documentAccessFor,
  documentActivity,
  documentWithinScope,
  grantFor,
  loadDistributions,
  loadDocument,
  loadDocumentSettings,
  type DocumentContext
} from '@/lib/forgeDocumentAccess'
import { exactIlike, parseDocumentInput, type DocumentFormInput } from '@/lib/forgeDocumentLibrary'
import { loadFolderInputs } from '@/lib/forgeDocumentLibraryServer'
import {
  canConfirmReview,
  canObsolete,
  checkFolderRename,
  folderKey,
  mergeDocumentFolders,
  normalizeDistributions,
  normalizeFolderName,
  MAX_FOLDER_NAME_LENGTH
} from '@/lib/forgeDocumentRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 12: library and document record actions (create, edit, distribution, archive, obsolete,
 * confirm review, folders, settings). Workflow steps on versions live in workflowActions.ts.
 */

type Result = { error?: string; errors?: Record<string, string>; message?: string; id?: string; nextDueOn?: string }

const db = () => createServiceRoleClient() as any

const contextFor = async (key: string) => (await tenantPermissionOrNull(key)) as unknown as DocumentContext | null

const refresh = (documentId?: string) => {
  revalidatePath('/documents', 'layout')
  if (documentId) revalidatePath('/documents/' + documentId)
}

/** A plain-language message from an RPC / trigger error. */
const dbMessage = (error: { message?: string } | null, fallback: string) => {
  const message = error?.message || ''

  return message && !/violates|syntax|column|relation|permission denied/i.test(message) ? message : fallback
}

/** The document, when the user can manage it. */
const managedDocument = async (context: DocumentContext, documentId: string, key: 'manage' | 'approve' = 'manage') => {
  const doc = await loadDocument(context.activeOrganization.id, documentId)

  if (!doc) return null
  const access = await documentAccessFor(context, doc)

  return access?.[key] ? doc : null
}

/** Location / division managers may only file documents at their own locations. */
const locationAllowed = async (context: DocumentContext, locationId: string | null) => {
  const grant = grantFor(context, 'documents.manage')

  if (!grant || grant.scope === 'organization' || grant.scope === 'own' || grant.scope === 'assigned') return true

  return documentWithinScope({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    scope: grant.scope,
    doc: { organization_id: context.activeOrganization.id, location_id: locationId, owner_user_id: null, created_by: null }
  })
}

const checkReferences = async (context: DocumentContext, values: { location_id: string | null; owner_user_id: string | null }) => {
  const organizationId = context.activeOrganization.id
  const errors: Record<string, string> = {}

  if (values.location_id) {
    const { data } = await db().from('locations').select('id').eq('organization_id', organizationId).eq('id', values.location_id).maybeSingle()

    if (!data) errors.locationId = 'Pick a location from the list.'
  }

  if (!(await locationAllowed(context, values.location_id))) errors.locationId = 'Pick one of your locations.'

  if (values.owner_user_id) {
    const { data } = await db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('user_id', values.owner_user_id).eq('is_active', true).maybeSingle()

    if (!data) errors.ownerUserId = 'Pick an owner from the list.'
  }

  return errors
}

const duplicateNumber = (error: { code?: string; message?: string } | null) => error?.code === '23505' || /forge_documents_number_key/.test(error?.message || '')

export const createDocument = async (input: DocumentFormInput): Promise<Result> => {
  const context = await contextFor('documents.manage')

  if (!context) return { error: 'You do not have permission to add documents.' }

  const organizationId = context.activeOrganization.id
  const { values, errors } = parseDocumentInput(input)

  Object.assign(errors, await checkReferences(context, values))
  if (Object.keys(errors).length) return { errors }

  const settings = await loadDocumentSettings(organizationId)
  let documentNumber = values.document_number

  if (!documentNumber) {
    const { data, error } = await db().rpc('next_forge_document_number', { p_organization_id: organizationId })

    if (error || !data) return { error: 'Unable to number the document.' }
    documentNumber = String(data)
  }

  const row = {
    organization_id: organizationId,
    document_number: documentNumber,
    name: values.name,
    description: values.description,
    category: values.category,
    location_id: values.location_id,
    owner_user_id: values.owner_user_id || context.user.id,
    review_interval_months: values.review_interval_months ?? settings.default_review_interval_months,
    review_due_on: values.review_due_on,
    requires_acknowledgment: values.requires_acknowledgment,
    created_by: context.user.id,
    updated_by: context.user.id
  }

  const { data, error } = await db().from('forge_documents').insert(row).select('id').single()

  if (duplicateNumber(error)) return { errors: { documentNumber: 'Another document already uses this number.' } }
  if (error || !data) return { error: dbMessage(error, 'Unable to add the document.') }

  await documentActivity({ organizationId, documentId: data.id, actorUserId: context.user.id, type: 'created', message: `Document ${documentNumber} created.` })
  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.created', entityType: 'forge_document', entityId: data.id, afterValue: row })
  refresh()

  return { id: data.id, message: 'Document added.' }
}

export const updateDocument = async (documentId: string, input: DocumentFormInput): Promise<Result> => {
  const context = await contextFor('documents.manage')

  if (!context) return { error: 'You do not have permission to edit documents.' }

  const doc = await managedDocument(context, documentId)

  if (!doc) return { error: 'Document not found.' }
  if (doc.status === 'obsolete') return { error: 'An obsolete document can’t be edited.' }
  if (doc.archived_at) return { error: 'Restore the document before editing it.' }

  const organizationId = context.activeOrganization.id
  const { values, errors } = parseDocumentInput(input)

  if (!values.document_number) errors.documentNumber = 'Enter a document number.'
  Object.assign(errors, await checkReferences(context, values))
  if (Object.keys(errors).length) return { errors }

  const changes = {
    document_number: values.document_number,
    name: values.name,
    description: values.description,
    category: values.category,
    location_id: values.location_id,
    owner_user_id: values.owner_user_id,
    review_interval_months: values.review_interval_months,
    review_due_on: values.review_due_on,
    requires_acknowledgment: values.requires_acknowledgment,
    updated_by: context.user.id
  }

  const { error } = await db().from('forge_documents').update(changes).eq('organization_id', organizationId).eq('id', doc.id)

  if (duplicateNumber(error)) return { errors: { documentNumber: 'Another document already uses this number.' } }
  if (error) return { error: dbMessage(error, 'Unable to save the document.') }

  const before = Object.fromEntries(Object.keys(changes).map(key => [key, doc[key]]))
  const changed = Object.keys(changes).filter(key => key !== 'updated_by' && String(before[key] ?? '') !== String((changes as any)[key] ?? ''))

  if (changed.length) {
    await documentActivity({ organizationId, documentId: doc.id, actorUserId: context.user.id, type: 'updated', message: 'Details updated.', metadata: { fields: changed } })
  }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.updated', entityType: 'forge_document', entityId: doc.id, beforeValue: before, afterValue: changes })
  refresh(doc.id)

  return { id: doc.id, message: 'Document saved.' }
}

/** Replaces who the document is for. No rows = everyone in the company. */
export const saveDistribution = async (documentId: string, rows: { scope_type: string; scope_id?: string | null }[]): Promise<Result> => {
  const context = await contextFor('documents.manage')

  if (!context) return { error: 'You do not have permission to change who a document is for.' }

  const doc = await managedDocument(context, documentId)

  if (!doc) return { error: 'Document not found.' }
  if (doc.archived_at) return { error: 'Restore the document before changing it.' }

  const organizationId = context.activeOrganization.id
  const next = normalizeDistributions(Array.isArray(rows) ? rows.slice(0, 200) : [])
  const before = await loadDistributions(organizationId, doc.id)

  const { error: deleteError } = await db().from('forge_document_distributions').delete().eq('organization_id', organizationId).eq('document_id', doc.id)

  if (deleteError) return { error: 'Unable to save who the document is for.' }

  if (next.length) {
    const { error } = await db()
      .from('forge_document_distributions')
      .insert(next.map(row => ({ organization_id: organizationId, document_id: doc.id, scope_type: row.scope_type, scope_id: row.scope_id, created_by: context.user.id })))

    if (error) {
      // Put the previous rules back so the document doesn't silently go to everyone.
      if (before.length) {
        await db()
          .from('forge_document_distributions')
          .insert(before.map(row => ({ organization_id: organizationId, document_id: doc.id, scope_type: row.scope_type, scope_id: row.scope_id, created_by: context.user.id })))
      }

      return { error: dbMessage(error, 'Unable to save who the document is for.') }
    }
  }

  await documentActivity({
    organizationId,
    documentId: doc.id,
    actorUserId: context.user.id,
    type: 'distribution_changed',
    message: next.length ? `Distribution changed (${next.length} rule${next.length === 1 ? '' : 's'}).` : 'Distribution changed to everyone in the company.',
    metadata: { before, after: next }
  })
  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.distribution_changed', entityType: 'forge_document', entityId: doc.id, beforeValue: { rows: before }, afterValue: { rows: next } })
  refresh(doc.id)

  return { message: 'Distribution saved.' }
}

export const setDocumentArchived = async (documentId: string, archive: boolean): Promise<Result> => {
  const context = await contextFor('documents.manage')

  if (!context) return { error: 'You do not have permission to archive documents.' }

  const doc = await managedDocument(context, documentId)

  if (!doc) return { error: 'Document not found.' }

  const organizationId = context.activeOrganization.id
  const { error } = await db().rpc('forge_document_archive', { p_organization_id: organizationId, p_document_id: doc.id, p_actor_user_id: context.user.id, p_archive: archive })

  if (error) return { error: dbMessage(error, archive ? 'Unable to archive the document.' : 'Unable to restore the document.') }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: archive ? 'documents.archived' : 'documents.restored', entityType: 'forge_document', entityId: doc.id })
  refresh(doc.id)

  return { message: archive ? 'Document archived.' : 'Document restored.' }
}

export const markDocumentObsolete = async (documentId: string, reason: string): Promise<Result> => {
  const context = await contextFor('documents.approve')

  if (!context) return { error: 'You do not have permission to make documents obsolete.' }

  const doc = await managedDocument(context, documentId, 'approve')

  if (!doc) return { error: 'Document not found.' }
  if (!canObsolete(doc)) return { error: 'Only a published document can be made obsolete.' }
  if (!String(reason || '').trim()) return { errors: { reason: 'Give a reason.' } }

  const organizationId = context.activeOrganization.id

  const { error } = await db().rpc('forge_document_mark_obsolete', {
    p_organization_id: organizationId,
    p_document_id: doc.id,
    p_actor_user_id: context.user.id,
    p_reason: String(reason).trim().slice(0, 2000)
  })

  if (error) return { error: dbMessage(error, 'Unable to make the document obsolete.') }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.obsoleted', entityType: 'forge_document', entityId: doc.id, reason: String(reason).trim().slice(0, 2000) })
  refresh(doc.id)

  return { message: 'Document made obsolete.' }
}

export const confirmDocumentReview = async (documentId: string, note?: string): Promise<Result> => {
  const context = await contextFor('documents.manage')

  if (!context) return { error: 'You do not have permission to confirm reviews.' }

  const doc = await managedDocument(context, documentId)

  if (!doc) return { error: 'Document not found.' }
  if (!canConfirmReview(doc)) return { error: 'Only a published document can be reviewed.' }

  const organizationId = context.activeOrganization.id

  const { data, error } = await db().rpc('forge_document_confirm_review', {
    p_organization_id: organizationId,
    p_document_id: doc.id,
    p_actor_user_id: context.user.id,
    p_note: String(note || '').trim().slice(0, 2000) || null
  })

  if (error) return { error: dbMessage(error, 'Unable to confirm the review.') }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.review_confirmed', entityType: 'forge_document', entityId: doc.id, afterValue: { review_due_on: data } })
  refresh(doc.id)

  return { message: `Review confirmed. Next review ${data}.`, nextDueOn: String(data) }
}

// ---------------------------------------------------------------------------
// Folders (company-wide: need documents.manage at organization scope to rename or delete)
// ---------------------------------------------------------------------------

const folderContext = async (rename: boolean) => {
  const context = await contextFor('documents.manage')

  if (!context) return null
  if (rename && grantFor(context, 'documents.manage')?.scope !== 'organization') return null

  return context
}

export const createFolder = async (rawName: string): Promise<Result> => {
  const context = await folderContext(false)

  if (!context) return { error: 'You do not have permission to add folders.' }

  const name = normalizeFolderName(rawName)

  if (!name) return { error: `Enter a folder name (up to ${MAX_FOLDER_NAME_LENGTH} characters).` }

  const organizationId = context.activeOrganization.id
  const folders = mergeDocumentFolders(await loadFolderInputs(organizationId))

  if (folders.some(folder => folderKey(folder.name) === folderKey(name))) return { error: `A folder named "${name}" already exists.` }

  const { data, error } = await db().from('forge_document_folders').insert({ organization_id: organizationId, name, created_by: context.user.id }).select('id').single()

  if (error || !data) return { error: error?.code === '23505' ? `A folder named "${name}" already exists.` : 'Unable to add the folder.' }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.folder_created', entityType: 'forge_document_folder', entityId: data.id, afterValue: { name } })
  refresh()

  return { id: data.id, message: 'Folder added.' }
}

/** Rename a folder: every document filed in it (archived ones too) moves to the new name. */
export const renameFolder = async (from: string, to: string): Promise<Result> => {
  const context = await folderContext(true)

  if (!context) return { error: 'Only company-wide document managers can rename folders.' }

  const organizationId = context.activeOrganization.id
  const folders = mergeDocumentFolders(await loadFolderInputs(organizationId))
  const check = checkFolderRename(folders, from, to)

  if (!check.ok) return { error: check.message }

  const oldName = normalizeFolderName(from) as string
  const supabase = db()
  const { data: stored } = await supabase.from('forge_document_folders').select('id').eq('organization_id', organizationId).ilike('name', exactIlike(oldName)).maybeSingle()
  let folderId = stored?.id as string | undefined

  if (folderId) {
    const { error } = await supabase.from('forge_document_folders').update({ name: check.name }).eq('organization_id', organizationId).eq('id', folderId)

    if (error) return { error: 'Unable to rename the folder.' }
  } else {
    // A folder that only existed as a category becomes a stored folder so it survives being emptied.
    const { data, error } = await supabase.from('forge_document_folders').insert({ organization_id: organizationId, name: check.name, created_by: context.user.id }).select('id').single()

    if (error || !data) return { error: 'Unable to rename the folder.' }
    folderId = data.id as string
  }

  const { data: moved, error: moveError } = await supabase
    .from('forge_documents')
    .update({ category: check.name, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .ilike('category', exactIlike(oldName))
    .select('id')

  if (moveError) return { error: 'The folder was renamed, but some documents could not be moved. Try again.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'documents.folder_renamed',
    entityType: 'forge_document_folder',
    entityId: folderId as string,
    beforeValue: { name: oldName },
    afterValue: { name: check.name, documents_moved: (moved || []).length }
  })
  refresh()

  return { message: 'Folder renamed.' }
}

/** Delete a folder. Its documents are kept and move to "Not in a folder". Built-in folders can't be deleted. */
export const deleteFolder = async (rawName: string): Promise<Result> => {
  const context = await folderContext(true)

  if (!context) return { error: 'Only company-wide document managers can delete folders.' }

  const name = normalizeFolderName(rawName)

  if (!name) return { error: 'Folder not found.' }

  const organizationId = context.activeOrganization.id
  const folders = mergeDocumentFolders(await loadFolderInputs(organizationId))
  const folder = folders.find(item => folderKey(item.name) === folderKey(name))

  if (!folder) return { error: 'Folder not found.' }
  if (!folder.canDelete) return { error: `"${folder.name}" can’t be deleted.` }

  const supabase = db()

  const { data: moved, error: moveError } = await supabase
    .from('forge_documents')
    .update({ category: null, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .ilike('category', exactIlike(name))
    .select('id')

  if (moveError) return { error: 'Unable to delete the folder.' }

  await supabase.from('forge_document_folders').delete().eq('organization_id', organizationId).ilike('name', exactIlike(name))
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'documents.folder_deleted',
    entityType: 'forge_document_folder',
    entityId: folder.id || organizationId,
    beforeValue: { name: folder.name },
    afterValue: { documents_moved: (moved || []).length }
  })
  refresh()

  return { message: 'Folder deleted.' }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type DocumentSettingsInput = { allowSelfApproval: boolean; defaultReviewIntervalMonths: number | string; reviewWarningDays: number | string }

export const saveDocumentSettings = async (input: DocumentSettingsInput): Promise<Result> => {
  const context = await contextFor('documents.settings')

  if (!context) return { error: 'You do not have permission to change Document Control settings.' }

  const organizationId = context.activeOrganization.id
  const interval = Number(input.defaultReviewIntervalMonths)
  const warning = Number(input.reviewWarningDays)
  const errors: Record<string, string> = {}

  if (!Number.isInteger(interval) || interval < 1 || interval > 60) errors.defaultReviewIntervalMonths = 'Choose 1 to 60 months.'
  if (!Number.isInteger(warning) || warning < 1 || warning > 180) errors.reviewWarningDays = 'Choose 1 to 180 days.'
  if (Object.keys(errors).length) return { errors }

  const before = await loadDocumentSettings(organizationId)

  const values = {
    organization_id: organizationId,
    allow_self_approval: Boolean(input.allowSelfApproval),
    default_review_interval_months: interval,
    review_warning_days: warning,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await db().from('forge_document_settings').upsert(values, { onConflict: 'organization_id' })

  if (error) return { error: 'Unable to save the settings.' }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'documents.settings_saved', entityType: 'forge_document_settings', entityId: organizationId, beforeValue: before, afterValue: values })
  refresh()

  return { message: 'Settings saved.' }
}
