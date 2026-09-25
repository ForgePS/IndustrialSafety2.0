import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import {
  createEvidenceMetadata,
  EVIDENCE_MAX_BYTES,
  isAllowedEvidenceMime,
  type EvidenceType
} from '@/lib/forgeEvidence'
import {
  requireForgePermissionForResource,
  requireForgeResourceManage
} from '@/lib/forgeResourceRegistry'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')
  let validOrigin = false
  if (origin && host) {
    try {
      validOrigin = new URL(origin).host === host
    } catch {
      validOrigin = false
    }
  }
  if (!validOrigin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  if (Number(request.headers.get('content-length') || 0) > 11500000) {
    return NextResponse.json({ error: 'File is too large.' }, { status: 413 })
  }

  const {
    data: { user }
  } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  const resourceType = String(form.get('resourceType') || '')
  const resourceId = String(form.get('resourceId') || '')
  const evidenceType = String(form.get('evidenceType') || 'other') as EvidenceType
  const description = String(form.get('description') || '').trim() || null

  if (!resourceType || !resourceId) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const auth = await requireForgeResourceManage({ resourceType, resourceId })
  if (!auth.ok) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const evidencePerm = await requireForgePermissionForResource({
    permissionKey: 'records.evidence.upload',
    resource: auth.resource,
    access: auth.access,
    organizationId: auth.context.activeOrganization.id,
    userId: auth.context.user.id
  })
  if (!evidencePerm.ok) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const organizationId = auth.resource.organizationId

  if (!(file instanceof File) || file.size < 1 || file.size > EVIDENCE_MAX_BYTES) {
    return NextResponse.json({ error: 'Choose a file under 10 MB.' }, { status: 400 })
  }

  if (!isAllowedEvidenceMime(file.type)) {
    return NextResponse.json(
      { error: 'Choose a PNG, JPG, WebP, PDF, TXT, or CSV file.' },
      { status: 400 }
    )
  }

  const allowedTypes: EvidenceType[] = [
    'photo',
    'document',
    'video',
    'form',
    'signature',
    'measurement',
    'other'
  ]
  const type = allowedTypes.includes(evidenceType) ? evidenceType : 'other'

  const evidenceId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255) || 'evidence'
  const storagePath = organizationId + '/' + resourceType + '/' + resourceId + '/' + evidenceId
  const supabase = createServiceRoleClient() as any

  const { error: uploadError } = await supabase.storage
    .from('forge-evidence')
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Unable to upload evidence.' }, { status: 500 })
  }

  const created = await createEvidenceMetadata({
    organizationId,
    resourceType,
    resourceId,
    fileName: safeName,
    storagePath,
    contentType: file.type,
    sizeBytes: file.size,
    uploadedBy: user.id,
    evidenceType: type,
    description,
    authorizedResource: auth.resource
  })

  if (created.error || !created.evidence) {
    await supabase.storage.from('forge-evidence').remove([storagePath])
    return NextResponse.json({ error: created.error || 'Unable to save evidence.' }, { status: 500 })
  }

  return NextResponse.json({ id: created.evidence.id })
}
