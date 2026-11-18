import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { MATERIAL_MAX_BYTES, MATERIAL_TYPES, TRAINING_BUCKET } from '@/lib/forgeTrainingLms'

export const dynamic = 'force-dynamic'

/** Uploads a course material (PDF, image, MP4 video or text) to the private training bucket. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  let sameOrigin = false

  try {
    sameOrigin = Boolean(origin && host && new URL(origin).host === host)
  } catch {
    sameOrigin = false
  }

  if (!sameOrigin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  if (Number(request.headers.get('content-length') || 0) > MATERIAL_MAX_BYTES + 1_000_000) {
    return NextResponse.json({ error: 'Files must be 50 MB or smaller.' }, { status: 413 })
  }

  const context = await requireTenantPermission('training.manage_content')
  const organizationId = context.activeOrganization.id
  const form = await request.formData()
  const file = form.get('file')
  const courseId = String(form.get('courseId') || '')
  const title = String(form.get('title') || '').trim()
  const description = String(form.get('description') || '').trim() || null

  if (!(file instanceof File) || file.size < 1) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
  if (file.size > MATERIAL_MAX_BYTES) return NextResponse.json({ error: 'Files must be 50 MB or smaller.' }, { status: 400 })

  if (!(MATERIAL_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'Upload a PDF, PNG, JPG, WebP, MP4 video or text file.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient() as any
  const { data: course } = await supabase.from('forge_training_courses').select('id').eq('organization_id', organizationId).eq('id', courseId).maybeSingle()

  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 })

  const materialId = randomUUID()
  const fileName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255) || 'material'
  const storagePath = `${organizationId}/${courseId}/${materialId}`

  const { error: uploadError } = await supabase.storage
    .from(TRAINING_BUCKET)
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: 'Unable to upload the file.' }, { status: 500 })

  const { error } = await supabase.from('forge_training_materials').insert({
    id: materialId,
    organization_id: organizationId,
    course_id: courseId,
    title: title || fileName,
    description,
    file_name: fileName,
    storage_path: storagePath,
    content_type: file.type,
    size_bytes: file.size,
    uploaded_by: context.user.id
  })

  if (error) {
    await supabase.storage.from(TRAINING_BUCKET).remove([storagePath])

    return NextResponse.json({ error: 'Unable to save the material.' }, { status: 500 })
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'training.material_uploaded',
    entityType: 'training_material',
    entityId: materialId,
    afterValue: { course_id: courseId, file_name: fileName, content_type: file.type, size_bytes: file.size }
  })

  return NextResponse.json({ id: materialId, message: 'Material uploaded.' })
}
