import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { LOTO_PHOTO_MAX_BYTES, LOTO_PHOTO_TYPES, LOTO_PHOTOS_PER_SLOT } from '@/lib/forgeLotoRules'
import { audit, looksLikePhoto, requireProcedureInScope, tenantPermissionOrNull } from '@/lib/forgeLotoServer'
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

/** Upload one equipment or energy-source photo to a Draft / Under Review procedure. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  if (Number(request.headers.get('content-length') || 0) > LOTO_PHOTO_MAX_BYTES + 200000) {
    return NextResponse.json({ error: 'Photos must be under 10 MB.' }, { status: 413 })
  }

  const context = await tenantPermissionOrNull('loto.edit')

  if (!context) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('file')
  const procedureId = String(form.get('procedureId') || '')
  const energySourceId = String(form.get('energySourceId') || '') || null
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const scoped = await requireProcedureInScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedureId,
    supabase
  })

  if ('error' in scoped) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  if (!['draft', 'review'].includes(scoped.procedure.status)) {
    return NextResponse.json({ error: 'Create a revision before changing photos.' }, { status: 409 })
  }

  if (!(file instanceof File) || file.size < 1 || file.size > LOTO_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: 'Choose a photo under 10 MB.' }, { status: 400 })
  }

  if (!(LOTO_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'Choose a JPG, PNG or WebP photo.' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!looksLikePhoto(bytes, file.type)) {
    return NextResponse.json({ error: 'That file is not a JPG, PNG or WebP photo.' }, { status: 400 })
  }

  let countQuery = supabase
    .from('forge_loto_photos')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)

  countQuery = energySourceId ? countQuery.eq('energy_source_id', energySourceId) : countQuery.is('energy_source_id', null)

  const { count } = await countQuery

  if ((count || 0) >= LOTO_PHOTOS_PER_SLOT) {
    return NextResponse.json({ error: `Each photo slot holds ${LOTO_PHOTOS_PER_SLOT} photos. Remove one first.` }, { status: 409 })
  }

  const photoId = crypto.randomUUID()
  const storagePath = `${organizationId}/${procedureId}/${photoId}`
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || 'photo'

  const { error: uploadError } = await storage().upload('forge-loto', storagePath, bytes, file.type)

  if (uploadError) return NextResponse.json({ error: 'Unable to upload the photo.' }, { status: 500 })

  const { data: photo, error } = await supabase
    .from('forge_loto_photos')
    .insert({
      id: photoId,
      organization_id: organizationId,
      procedure_id: procedureId,
      energy_source_id: energySourceId,
      storage_path: storagePath,
      file_name: safeName,
      content_type: file.type,
      byte_size: file.size,
      sort_order: (count || 0) * 10 + 10,
      created_by: context.user.id
    })
    .select('id')
    .single()

  if (error || !photo) {
    await storage().remove('forge-loto', [storagePath])

    return NextResponse.json({ error: error?.message || 'Unable to save the photo.' }, { status: 400 })
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'loto.photo_added',
    entityType: 'loto_procedure',
    entityId: procedureId,
    after: { photo_id: photo.id, energy_source_id: energySourceId, file_name: safeName }
  })

  revalidatePath('/loto/' + procedureId)

  return NextResponse.json({ id: photo.id })
}
