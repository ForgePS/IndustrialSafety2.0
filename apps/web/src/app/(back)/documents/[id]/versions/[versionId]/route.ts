import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { documentAccessFor, documentActivity, loadDocument, VERSION_COLUMNS, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { routeFail as fail, sameOrigin } from '@/lib/forgeDocumentRoute'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/** Port slice 12: delete a draft version (documents.manage). Submitted and approved versions are kept. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  if (!sameOrigin(request)) return fail('Invalid request origin.', 403)

  const { id, versionId } = await params
  const context = (await tenantPermissionOrNull('documents.manage')) as unknown as DocumentContext | null

  if (!context || !/^[0-9a-f-]{36}$/i.test(versionId)) return fail('Not found.', 404)

  const organizationId = context.activeOrganization.id
  const doc = await loadDocument(organizationId, id)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access?.manage) return fail('Not found.', 404)

  const supabase = createServiceRoleClient() as any

  const { data: version } = await supabase
    .from('forge_document_versions')
    .select(VERSION_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('document_id', doc.id)
    .eq('id', versionId)
    .maybeSingle()

  if (!version) return fail('Not found.', 404)
  if (version.status !== 'draft') return fail('Only draft versions can be deleted.', 400)

  const { error } = await supabase.from('forge_document_versions').delete().eq('organization_id', organizationId).eq('id', version.id)

  if (error) return fail(/draft/i.test(error.message || '') ? 'Only draft versions can be deleted.' : 'Unable to delete the version.', 400)

  await storage().remove('forge-documents', [version.storage_path])
  await documentActivity({
    organizationId,
    documentId: doc.id,
    actorUserId: context.user.id,
    type: 'version_deleted',
    message: `Draft version ${version.version_number} deleted (${version.file_name}).`
  })
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'documents.version_deleted',
    entityType: 'forge_document',
    entityId: doc.id,
    beforeValue: { version_id: version.id, version_number: version.version_number, file_name: version.file_name }
  })
  revalidatePath('/documents/' + doc.id)

  return NextResponse.json({ ok: true })
}
