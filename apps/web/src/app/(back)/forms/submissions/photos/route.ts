import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { allowedPermission, canEditFormSubmission } from '@/lib/forgeFormSubmissions'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { storage } from '@/lib/platform/storage'

/**
 * Port slice 9: uploads one photo for a form photo field. The photo is stored in the private forge-evidence
 * bucket with a forge_record_evidence row (resource_type 'form_submission'); the answer holds its id.
 * A new submission's id is reserved by the fill page, so photos can be attached before the first save.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 10 * 1024 * 1024

const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': { ext: 'webp', magic: b => String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP' }
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return fail('Sign in required.', 401)

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })

  if (!allowedPermission(access, 'forms.submit') && !allowedPermission(access, 'forms.edit')) return fail('Not found.', 404)

  const form = await request.formData().catch(() => null)
  const submissionId = String(form?.get('submissionId') || '')
  const file = form?.get('file')

  if (!UUID.test(submissionId)) return fail('Not found.', 404)
  if (!file || typeof file === 'string') return fail('Choose a photo to upload.', 400)

  const supabase = createServiceRoleClient() as any
  const { data: submission } = await supabase.from('forge_form_submissions').select('*').eq('id', submissionId).maybeSingle()

  if (submission && !(await canEditFormSubmission({ organizationId, userId: context.user.id, access, submission }))) return fail('Not found.', 404)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = TYPES[file.type]

  if (!type || !type.magic(bytes)) return fail('Photos must be JPG, PNG or WebP images.', 400)
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_BYTES) return fail('Each photo must be under 10 MB.', 400)

  const id = randomUUID()
  const storagePath = `${organizationId}/form_submission/${submissionId}/${id}`
  const upload = await storage().upload('forge-evidence', storagePath, bytes, file.type)

  if (upload.error) return fail('Unable to upload the photo. Try again.', 500)

  const fileName = (file.name || '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || `form-photo.${type.ext}`

  const { error } = await supabase.from('forge_record_evidence').insert({
    id,
    organization_id: organizationId,
    resource_type: 'form_submission',
    resource_id: submissionId,
    file_name: fileName,
    storage_path: storagePath,
    content_type: file.type,
    size_bytes: bytes.byteLength,
    evidence_type: 'photo',
    description: 'Form photo',
    uploaded_by: context.user.id
  })

  if (error) {
    await storage().remove('forge-evidence', [storagePath])

    return fail('Unable to save the photo. Try again.', 500)
  }

  return NextResponse.json({ id, fileName })
}
