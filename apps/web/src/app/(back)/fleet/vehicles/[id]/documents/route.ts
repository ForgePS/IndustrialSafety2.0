import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { fleetActivity } from '@/lib/forgeFleetAccess'
import { DOCUMENT_TYPES, FLEET_DOCUMENT_MAX_BYTES, loadVehicleInScope, sniffFleetDocument, type FleetContext } from '@/lib/forgeFleetVehicles'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/**
 * Port slice 11: upload a vehicle document (fleet.edit). multipart: file, documentType, title, expiresOn.
 * JPEG, PNG, WebP or PDF up to 12 MB, checked by the file's first bytes. Stored privately in 'forge-fleet'
 * at <org>/<vehicle>/<uuid> (1.0 kept documents inline as data URLs).
 */

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')

  if (!origin || !host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail('Invalid request origin.', 403)
  if (Number(request.headers.get('content-length') || 0) > FLEET_DOCUMENT_MAX_BYTES + 200_000) return fail('Files must be 12 MB or smaller.', 413)

  const { id } = await params
  const context = (await tenantPermissionOrNull('fleet.edit')) as unknown as FleetContext | null

  if (!context) return fail('Not found.', 404)

  const vehicle = await loadVehicleInScope({ context, vehicleId: id })

  if (!vehicle) return fail('Not found.', 404)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const documentType = String(form?.get('documentType') || '')
  const title = String(form?.get('title') || '').trim().slice(0, 200) || null
  const expiresOn = String(form?.get('expiresOn') || '').trim() || null

  if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) return fail('Pick a document type.', 400)
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return fail('Enter a valid expiry date.', 400)
  if (!(file instanceof File) || file.size < 1) return fail('Choose a file.', 400)
  if (file.size > FLEET_DOCUMENT_MAX_BYTES) return fail('Files must be 12 MB or smaller.', 400)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = sniffFleetDocument(bytes)

  if (!contentType) return fail('Choose a PDF or a photo (JPG, PNG or WebP).', 400)

  const organizationId = context.activeOrganization.id
  const documentId = crypto.randomUUID()
  const storagePath = `${organizationId}/${vehicle.id}/${documentId}`
  const fileName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || 'document'

  const { error: uploadError } = await storage().upload('forge-fleet', storagePath, bytes, contentType)

  if (uploadError) return fail('Unable to upload the file.', 500)

  const { error } = await (createServiceRoleClient() as any).from('forge_fleet_documents').insert({
    id: documentId,
    organization_id: organizationId,
    vehicle_id: vehicle.id,
    document_type: documentType,
    title,
    expires_on: expiresOn,
    file_name: fileName,
    storage_path: storagePath,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_by: context.user.id
  })

  if (error) {
    await storage().remove('forge-fleet', [storagePath])

    return fail('Unable to save the document.', 400)
  }

  await fleetActivity({ organizationId, vehicleId: vehicle.id, actorUserId: context.user.id, type: 'document_added', message: `Document added: ${fileName}.`, metadata: { document_id: documentId, document_type: documentType } })
  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'fleet.document_added', entityType: 'fleet_vehicle', entityId: vehicle.id, afterValue: { document_id: documentId, document_type: documentType, file_name: fileName } })
  revalidatePath('/fleet/vehicles/' + vehicle.id)
  revalidatePath('/fleet/renewals')

  return NextResponse.json({ id: documentId })
}
