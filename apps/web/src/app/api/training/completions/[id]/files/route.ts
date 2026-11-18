import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { looksLikeDotFile } from '@/lib/forgeDotRules'
import { TRAINING_FILES_BUCKET, completionAccess } from '@/lib/forgeTrainingFiles'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, attachmentTypeFromName } from '@/lib/forgeTrainingReportRules'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { writeForgeAudit } from '@/lib/forgeAudit'
import { storage } from '@/lib/platform/storage'

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

/**
 * Attach a certificate or proof to a training completion. multipart: file.
 * Needs Record Completion for that person. PDF or photo, 12 MB, checked by its first bytes.
 * 1.0 trusted the size and type the browser declared; 2.0 checks the bytes it receives.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  if (Number(request.headers.get('content-length') || 0) > ATTACHMENT_MAX_BYTES + 200000) {
    return NextResponse.json({ error: 'Files must be under 12 MB.' }, { status: 413 })
  }

  const { id } = await params
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const access = await completionAccess({ user: context.user, activeOrganization: context.activeOrganization }, id)

  if (!access?.canEdit) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const organizationId = context.activeOrganization.id
  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File) || file.size < 1 || file.size > ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: 'Choose a file under 12 MB.' }, { status: 400 })
  }

  const type = file.type || attachmentTypeFromName(file.name)

  if (!(ATTACHMENT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Choose a PDF or a photo (JPG, PNG, WebP or HEIC).' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!looksLikeDotFile(bytes, type)) return NextResponse.json({ error: 'That file does not match its type. Choose a PDF or photo.' }, { status: 400 })

  const fileId = crypto.randomUUID()
  const storagePath = `${organizationId}/completions/${id}/${fileId}`
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || 'certificate'
  const { error: uploadError } = await storage().upload(TRAINING_FILES_BUCKET, storagePath, bytes, type)

  if (uploadError) return NextResponse.json({ error: 'Unable to upload the file.' }, { status: 500 })

  const { error } = await (createServiceRoleClient() as any).from('forge_training_completion_files').insert({
    id: fileId,
    organization_id: organizationId,
    completion_id: id,
    storage_path: storagePath,
    file_name: safeName,
    content_type: type,
    byte_size: file.size,
    uploaded_by: context.user.id
  })

  if (error) {
    await storage().remove(TRAINING_FILES_BUCKET, [storagePath])

    return NextResponse.json({ error: error.code === '23514' ? error.message : 'Unable to save the file.' }, { status: 400 })
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'training.completion_file_added',
    entityType: 'training_completion',
    entityId: id,
    afterValue: { file_id: fileId, file_name: safeName }
  })
  revalidatePath('/training/records')
  revalidatePath('/personnel/' + access.person.id)

  return NextResponse.json({ id: fileId, file_name: safeName })
}
