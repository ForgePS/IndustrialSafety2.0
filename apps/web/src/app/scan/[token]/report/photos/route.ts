import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import { ISSUE_PHOTO_MAX_BYTES, safePhotoName, sniffImageType } from '@/lib/forgeScanIssues'
import { storage } from '@/lib/platform/storage'

import { db, loadReportContext, uploadLimitReached, uploaderIds } from '../reportContext'

/**
 * Port slice 10: uploads one photo for a scan issue report (server actions are capped at 1 MB). The QR and
 * the viewer are resolved again from the token, report_issue must be allowed, and the type is checked from
 * the file's first bytes. The photo goes to forge-evidence at <org>/qr_issue/<qr id>/<upload id> with a
 * forge_qr_issue_uploads row; the opaque upload id is what the report form sends back. At most 30 uploads
 * per QR every 10 minutes.
 */

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const context = await loadReportContext(token)

  if (!context) return fail('This QR code is not active.', 404)
  if (!context.canReport) return fail('You cannot report an issue on this QR code.', 403)

  const { qr, viewer } = context

  if (await uploadLimitReached(qr.id)) return fail('Too many photos were uploaded on this QR code. Wait 10 minutes and try again.', 429)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!file || typeof file === 'string') return fail('Choose a photo to upload.', 400)
  if (file.size < 1 || file.size > ISSUE_PHOTO_MAX_BYTES) return fail('Each photo must be under 5 MB.', 400)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)

  if (!type) return fail('Photos must be JPG, PNG or WebP images.', 400)
  if (bytes.byteLength < 1 || bytes.byteLength > ISSUE_PHOTO_MAX_BYTES) return fail('Each photo must be under 5 MB.', 400)

  const id = randomUUID()
  const storagePath = `${qr.organizationId}/qr_issue/${qr.id}/${id}`
  const upload = await storage().upload('forge-evidence', storagePath, bytes, type)

  if (upload.error) return fail('Unable to upload the photo. Try again.', 500)

  const uploader = uploaderIds(viewer)
  const fileName = safePhotoName(file.name, type)

  const { error } = await db().from('forge_qr_issue_uploads').insert({
    id,
    organization_id: qr.organizationId,
    qr_code_id: qr.id,
    storage_path: storagePath,
    file_name: fileName,
    content_type: type,
    size_bytes: bytes.byteLength,
    uploader_user_id: uploader.userId,
    uploader_personnel_id: uploader.personnelId
  })

  if (error) {
    await storage().remove('forge-evidence', [storagePath])

    return fail('Unable to save the photo. Try again.', 500)
  }

  return NextResponse.json({ id, fileName, size: bytes.byteLength, type })
}
