import { createServiceRoleClient } from '@repo/supabase/server'
import { writeForgeAudit } from './forgeAudit'
import { writeRecordActivity } from './forgeRecordActivity'
import {
  isForgeResourceType,
  requireForgePermissionForResource,
  requireForgeResourceManage,
  requireForgeResourceView,
  resolveForgeResource,
  type ForgeResourceType,
  type ResolvedForgeResource
} from './forgeResourceRegistry'
import { getTenantContext } from './forgeTenantContext'

export type EvidenceType =
  | 'photo'
  | 'document'
  | 'video'
  | 'form'
  | 'signature'
  | 'measurement'
  | 'other'

export type RecordEvidence = {
  id: string
  organization_id: string
  resource_type: string
  resource_id: string
  file_name: string
  storage_path: string
  content_type: string
  size_bytes: number
  evidence_type: EvidenceType
  description: string | null
  uploaded_by: string
  uploaded_at: string
  archived_at: string | null
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv'
])

const MAX_BYTES = 10485760

export const listRecordEvidence = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => {
  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok || auth.resource.organizationId !== organizationId) {
    return [] as Omit<RecordEvidence, 'storage_path'>[]
  }

  const evidencePerm = await requireForgePermissionForResource({
    permissionKey: 'records.evidence.view',
    resource: auth.resource,
    access: auth.access,
    organizationId: auth.context.activeOrganization.id,
    userId: auth.context.user.id
  })
  if (!evidencePerm.ok) {
    return [] as Omit<RecordEvidence, 'storage_path'>[]
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_evidence')
    .select(
      'id, organization_id, resource_type, resource_id, file_name, content_type, size_bytes, evidence_type, description, uploaded_by, uploaded_at, archived_at'
    )
    .eq('organization_id', organizationId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as Omit<RecordEvidence, 'storage_path'>[]
}

export const createEvidenceMetadata = async ({
  organizationId,
  resourceType,
  resourceId,
  fileName,
  storagePath,
  contentType,
  sizeBytes,
  uploadedBy,
  evidenceType = 'other',
  description = null,
  authorizedResource = null
}: {
  organizationId: string
  resourceType: ForgeResourceType | string
  resourceId: string
  fileName: string
  storagePath: string
  contentType: string
  sizeBytes: number
  uploadedBy: string
  evidenceType?: EvidenceType
  description?: string | null
  /** When the caller already authorized via requireForgeResource*, pass the resolved resource. */
  authorizedResource?: ResolvedForgeResource | null
}) => {
  if (!isForgeResourceType(resourceType)) return { error: 'Unsupported resource type.' }
  if (!ALLOWED_MIME.has(contentType)) {
    return { error: 'File type is not allowed.' }
  }
  if (sizeBytes < 1 || sizeBytes > MAX_BYTES) {
    return { error: 'File size must be between 1 byte and 10 MB.' }
  }

  let resource = authorizedResource
  if (!resource) {
    const auth = await requireForgeResourceManage({ resourceType, resourceId })
    if (!auth.ok) return { error: 'Not found.' }
    if (auth.resource.organizationId !== organizationId) return { error: 'Not found.' }

    const evidencePerm = await requireForgePermissionForResource({
      permissionKey: 'records.evidence.upload',
      resource: auth.resource,
      access: auth.access,
      organizationId: auth.context.activeOrganization.id,
      userId: auth.context.user.id
    })
    if (!evidencePerm.ok) return { error: 'Not found.' }

    resource = auth.resource
  } else {
    if (resource.organizationId !== organizationId) return { error: 'Not found.' }
    if (resource.resourceType !== resourceType || resource.resourceId !== resourceId) {
      return { error: 'Not found.' }
    }
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_evidence')
    .insert({
      organization_id: organizationId,
      resource_type: resourceType,
      resource_id: resourceId,
      file_name: fileName.slice(0, 255),
      storage_path: storagePath,
      content_type: contentType,
      size_bytes: sizeBytes,
      evidence_type: evidenceType,
      description,
      uploaded_by: uploadedBy
    })
    .select('*')
    .single()

  if (error || !data) return { error: error?.message || 'Unable to save evidence metadata.' }

  await writeRecordActivity({
    organizationId,
    resourceType,
    resourceId,
    activityType: 'evidence_uploaded',
    message: 'Evidence uploaded: ' + fileName,
    actorUserId: uploadedBy,
    metadata: { evidence_id: data.id, evidence_type: evidenceType }
  })

  await writeForgeAudit({
    actorUserId: uploadedBy,
    organizationId,
    action: 'record_evidence.uploaded',
    entityType: 'record_evidence',
    entityId: data.id,
    afterValue: {
      resource_type: resourceType,
      resource_id: resourceId,
      file_name: fileName,
      evidence_type: evidenceType
    }
  })

  return { evidence: data as RecordEvidence }
}

export const archiveRecordEvidence = async ({ evidenceId }: { evidenceId: string }) => {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) return { error: 'Not found.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_record_evidence')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', evidenceId)
    .maybeSingle()

  if (!before) return { error: 'Not found.' }
  if (before.archived_at) return { error: 'Evidence is already archived.' }

  const parentAuth = await requireForgeResourceManage({
    resourceType: before.resource_type,
    resourceId: before.resource_id
  })
  if (!parentAuth.ok) return { error: 'Not found.' }

  const evidencePerm = await requireForgePermissionForResource({
    permissionKey: 'records.evidence.manage',
    resource: parentAuth.resource,
    access: parentAuth.access,
    organizationId: parentAuth.context.activeOrganization.id,
    userId: parentAuth.context.user.id
  })
  if (!evidencePerm.ok) return { error: 'Not found.' }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('forge_record_evidence')
    .update({
      archived_at: now,
      archived_by: context.user.id
    })
    .eq('id', evidenceId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) return { error: error?.message || 'Unable to archive evidence.' }

  await writeRecordActivity({
    organizationId,
    resourceType: before.resource_type,
    resourceId: before.resource_id,
    activityType: 'evidence_archived',
    message: 'Evidence archived: ' + before.file_name,
    actorUserId: context.user.id,
    metadata: { evidence_id: evidenceId }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'record_evidence.archived',
    entityType: 'record_evidence',
    entityId: evidenceId,
    beforeValue: before,
    afterValue: data
  })

  return { evidence: data as RecordEvidence, message: 'Evidence archived.' }
}

export const getEvidenceDownloadUrl = async ({
  organizationId,
  evidenceId
}: {
  organizationId: string
  evidenceId: string
}) => {
  const supabase = createServiceRoleClient() as any
  const { data: evidence } = await supabase
    .from('forge_record_evidence')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', evidenceId)
    .is('archived_at', null)
    .maybeSingle()

  if (!evidence) return { error: 'Not found.' }

  // Re-check parent resource access on every download.
  const auth = await requireForgeResourceView({
    resourceType: evidence.resource_type,
    resourceId: evidence.resource_id
  })
  if (!auth.ok || auth.resource.organizationId !== organizationId) {
    return { error: 'Not found.' }
  }

  const evidencePerm = await requireForgePermissionForResource({
    permissionKey: 'records.evidence.view',
    resource: auth.resource,
    access: auth.access,
    organizationId: auth.context.activeOrganization.id,
    userId: auth.context.user.id
  })
  if (!evidencePerm.ok) {
    return { error: 'Not found.' }
  }

  const { data, error } = await supabase.storage
    .from('forge-evidence')
    .createSignedUrl(evidence.storage_path, 60, { download: evidence.file_name })

  if (error || !data?.signedUrl) {
    return { error: error?.message || 'Unable to create download URL.' }
  }

  return { url: data.signedUrl as string, evidence: evidence as RecordEvidence }
}

export const assertEvidenceParentExists = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => resolveForgeResource({ organizationId, resourceType, resourceId })

export const isAllowedEvidenceMime = (mime: string) => ALLOWED_MIME.has(mime)
export const EVIDENCE_MAX_BYTES = MAX_BYTES
