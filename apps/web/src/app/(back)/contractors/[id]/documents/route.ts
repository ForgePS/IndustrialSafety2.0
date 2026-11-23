import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { cleanDocumentInput } from '@/lib/forgeContractorRules'
import { CONTRACTOR_BUCKET, CONTRACTOR_FILE_MAX_BYTES, contractorRights, loadCompany } from '@/lib/forgeContractors'
import { routeFail, sameOrigin } from '@/lib/forgeDocumentRoute'
import { safeFileName } from '@/lib/forgeDocumentRules'
import { sniffFleetDocument } from '@/lib/forgeFleetVehicles'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/**
 * Port slice 15: add a company document (certificate of insurance, safety program, license...) with
 * contractor_safety.manage over the company. multipart: docType, title, coverageAmount, effectiveOn, expiresOn
 * and an optional file (PDF, JPEG, PNG or WebP up to 12 MB, checked by its first bytes), stored privately in
 * 'forge-contractors' at <org>/<company>/<document>.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return routeFail('Invalid request origin.', 403)
  if (Number(request.headers.get('content-length') || 0) > CONTRACTOR_FILE_MAX_BYTES + 200_000) return routeFail('Files must be 12 MB or smaller.', 413)

  const { id } = await params
  const context = await tenantPermissionOrNull('contractor_safety.manage')

  if (!context) return routeFail('Not found.', 404)

  const organizationId = context.activeOrganization.id as string
  const rights = await contractorRights(organizationId, context.user.id, context.access)
  const found = await loadCompany({ organizationId, rights, id })

  if (!found || !found.canManage || found.company.archived_at) return routeFail('Not found.', 404)

  const form = await request.formData().catch(() => null)

  if (!form) return routeFail('Send the document details.', 400)

  const clean = cleanDocumentInput(Object.fromEntries(['docType', 'title', 'coverageAmount', 'effectiveOn', 'expiresOn'].map(key => [key, String(form.get(key) ?? '')])))

  if ('error' in clean) return routeFail(clean.error, 400)

  const file = form.get('file')
  const hasFile = file instanceof File && file.size > 0
  const documentId = crypto.randomUUID()
  let stored: { file_name: string; content_type: string; size_bytes: number; storage_path: string } | null = null

  if (hasFile) {
    if (file.size > CONTRACTOR_FILE_MAX_BYTES) return routeFail('Files must be 12 MB or smaller.', 400)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const contentType = sniffFleetDocument(bytes)

    if (!contentType) return routeFail('Choose a PDF or a photo (JPG, PNG or WebP).', 400)

    const storagePath = `${organizationId}/${found.company.id}/${documentId}`
    const { error: uploadError } = await storage().upload(CONTRACTOR_BUCKET, storagePath, bytes, contentType)

    if (uploadError) return routeFail('Unable to upload the file.', 500)
    stored = { file_name: safeFileName(file.name), content_type: contentType, size_bytes: file.size, storage_path: storagePath }
  }

  const row = {
    id: documentId,
    organization_id: organizationId,
    company_id: found.company.id,
    doc_type: clean.docType,
    title: clean.title,
    coverage_amount: clean.coverageAmount,
    effective_on: clean.effectiveOn,
    expires_on: clean.expiresOn,
    ...(stored || {}),
    created_by: context.user.id
  }

  const { error } = await (createServiceRoleClient() as any).from('forge_contractor_documents').insert(row)

  if (error) {
    if (stored) await storage().remove(CONTRACTOR_BUCKET, [stored.storage_path])

    return routeFail('Unable to save the document.', 400)
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'contractor_document.added',
    entityType: 'contractor_company',
    entityId: found.company.id,
    afterValue: { document_id: documentId, doc_type: clean.docType, expires_on: clean.expiresOn, file_name: stored?.file_name || null }
  }).catch(() => {})
  revalidatePath('/contractors', 'layout')

  return NextResponse.json({ id: documentId })
}
