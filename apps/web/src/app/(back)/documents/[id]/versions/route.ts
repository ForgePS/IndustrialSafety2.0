import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { documentAccessFor, documentActivity, loadDocument, loadVersions, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { nextVersionNumber } from '@/lib/forgeDocumentLibrary'
import { routeFail as fail, sameOrigin } from '@/lib/forgeDocumentRoute'
import { canUploadVersion, DOCUMENT_MAX_BYTES, safeFileName, sniffDocumentType } from '@/lib/forgeDocumentRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/**
 * Port slice 12: upload a new draft version of a document (documents.manage, document scope).
 * multipart: file, changeSummary. PDF, Office, image or text files up to 25 MB, checked by the file's first
 * bytes (1.0 trusted the browser's MIME type). Stored privately in 'forge-documents' at <org>/<doc>/<versionId>.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail('Invalid request origin.', 403)
  if (Number(request.headers.get('content-length') || 0) > DOCUMENT_MAX_BYTES + 200_000) return fail('Files must be 25 MB or smaller.', 413)

  const { id } = await params
  const context = (await tenantPermissionOrNull('documents.manage')) as unknown as DocumentContext | null

  if (!context) return fail('Not found.', 404)

  const organizationId = context.activeOrganization.id
  const doc = await loadDocument(organizationId, id)
  const access = doc ? await documentAccessFor(context, doc) : null

  if (!doc || !access?.manage) return fail('Not found.', 404)
  if (!canUploadVersion(doc)) return fail('Versions can only be added to an active document.', 400)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const changeSummary = String(form?.get('changeSummary') || '').trim().slice(0, 2000) || null

  if (!(file instanceof File) || file.size < 1) return fail('Choose a file.', 400)
  if (file.size > DOCUMENT_MAX_BYTES) return fail('Files must be 25 MB or smaller.', 400)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = sniffDocumentType(bytes, file.name)

  if (!contentType) return fail('Choose a PDF, Word, Excel, PowerPoint, image (JPG, PNG, WebP) or text file.', 400)

  const versionId = crypto.randomUUID()
  const storagePath = `${organizationId}/${doc.id}/${versionId}`
  const fileName = safeFileName(file.name)

  const { error: uploadError } = await storage().upload('forge-documents', storagePath, bytes, contentType)

  if (uploadError) return fail('Unable to upload the file.', 500)

  const supabase = createServiceRoleClient() as any
  let versionNumber = 0
  let insertError: { code?: string; message?: string } | null = null

  // Two uploads at once can pick the same number; try again with the next one.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    versionNumber = nextVersionNumber(await loadVersions(organizationId, doc.id))

    const { error } = await supabase.from('forge_document_versions').insert({
      id: versionId,
      organization_id: organizationId,
      document_id: doc.id,
      version_number: versionNumber,
      file_name: fileName,
      content_type: contentType,
      size_bytes: file.size,
      storage_path: storagePath,
      change_summary: changeSummary,
      created_by: context.user.id
    })

    insertError = error
    if (!error || error.code !== '23505') break
  }

  if (insertError) {
    await storage().remove('forge-documents', [storagePath])

    return fail('Unable to save the version.', 400)
  }

  await documentActivity({
    organizationId,
    documentId: doc.id,
    versionId,
    actorUserId: context.user.id,
    type: 'version_uploaded',
    message: `Version ${versionNumber} uploaded: ${fileName}.`,
    metadata: { content_type: contentType, size_bytes: file.size }
  })
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'documents.version_uploaded',
    entityType: 'forge_document',
    entityId: doc.id,
    afterValue: { version_id: versionId, version_number: versionNumber, file_name: fileName, content_type: contentType, size_bytes: file.size }
  })
  revalidatePath('/documents/' + doc.id)

  return NextResponse.json({ id: versionId, versionNumber })
}
