import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { DOT_FILE_MAX_BYTES, DOT_FILE_TYPES, DOT_SLOT_KEYS, looksLikeDotFile, nextMvrDue } from '@/lib/forgeDotRules'
import { loadCompanyDriverInScope, loadDotRecordInScope, loadDriverFileInScope } from '@/lib/forgeDotServer'
import { audit, tenantPermissionOrNull } from '@/lib/forgeLotoServer'
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

const ROSTER_SLOTS = ['mvr_consent', 'mvr_report', 'license']

/**
 * Upload one copy to a DQF document slot, a company driver (MVR consent / MVR report / license)
 * or a DOT record. multipart: file, parentType (dqf | company_driver | record), parentId, slot.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })

  if (Number(request.headers.get('content-length') || 0) > DOT_FILE_MAX_BYTES + 200000) {
    return NextResponse.json({ error: 'Files must be under 12 MB.' }, { status: 413 })
  }

  const context = await tenantPermissionOrNull('dot.edit')

  if (!context) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('file')
  const parentType = String(form.get('parentType') || '')
  const parentId = String(form.get('parentId') || '')
  const slot = String(form.get('slot') || '')

  const loaded =
    parentType === 'dqf'
      ? await loadDriverFileInScope(context as any, parentId)
      : parentType === 'company_driver'
        ? await loadCompanyDriverInScope(context as any, parentId)
        : parentType === 'record'
          ? await loadDotRecordInScope(context as any, parentId)
          : { error: 'Not found.' }

  if (!('ok' in loaded)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { organizationId, supabase, row } = loaded

  const validSlot =
    parentType === 'dqf' ? DOT_SLOT_KEYS.includes(slot) : parentType === 'company_driver' ? ROSTER_SLOTS.includes(slot) : slot === 'attachment'

  if (!validSlot) return NextResponse.json({ error: 'Unknown document.' }, { status: 400 })
  if (parentType === 'dqf' && row.archived_at) return NextResponse.json({ error: 'Restore the driver file before adding files.' }, { status: 409 })

  if (!(file instanceof File) || file.size < 1 || file.size > DOT_FILE_MAX_BYTES) {
    return NextResponse.json({ error: 'Choose a file under 12 MB.' }, { status: 400 })
  }

  if (!(DOT_FILE_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'Choose a PDF or a photo (JPG, PNG, WebP or HEIC).' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!looksLikeDotFile(bytes, file.type)) {
    return NextResponse.json({ error: 'That file does not match its type. Choose a PDF or photo.' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const folder = parentType === 'dqf' ? 'dqf' : parentType === 'company_driver' ? 'roster' : 'records'
  const storagePath = `${organizationId}/${folder}/${parentId}/${slot}/${id}`
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || 'document'

  const { error: uploadError } = await storage().upload('forge-dot', storagePath, bytes, file.type)

  if (uploadError) return NextResponse.json({ error: 'Unable to upload the file.' }, { status: 500 })

  const { error } = await supabase.from('forge_dot_files').insert({
    id,
    organization_id: organizationId,
    driver_file_id: parentType === 'dqf' ? parentId : null,
    company_driver_id: parentType === 'company_driver' ? parentId : null,
    record_id: parentType === 'record' ? parentId : null,
    slot,
    storage_path: storagePath,
    file_name: safeName,
    content_type: file.type,
    byte_size: file.size,
    uploaded_by: context.user.id
  })

  if (error) {
    await storage().remove('forge-dot', [storagePath])

    return NextResponse.json({ error: error.code === '23514' ? error.message : 'Unable to save the file.' }, { status: 400 })
  }

  // A consent form or MVR report on the roster dates the driver's record (1.0 behaviour). Unlike 1.0,
  // a new MVR moves the next-due date a year out instead of marking today as the expiry.
  if (parentType === 'company_driver' && (slot === 'mvr_consent' || slot === 'mvr_report')) {
    const today = new Date().toISOString().slice(0, 10)

    if (slot === 'mvr_consent') {
      await supabase.from('forge_dot_company_drivers').update({ mvr_consent_on: row.mvr_consent_on || today, updated_by: context.user.id }).eq('id', parentId)
    } else {
      await supabase
        .from('forge_dot_company_drivers')
        .update({ initial_mvr_on: row.initial_mvr_on || today, last_mvr_on: today, next_mvr_due_on: nextMvrDue(today), updated_by: context.user.id })
        .eq('id', parentId)

      if (row.personnel_id) {
        await supabase
          .from('forge_dot_driver_files')
          .update({ mvr_completed_on: today, mvr_expires_on: nextMvrDue(today), updated_by: context.user.id })
          .eq('personnel_id', row.personnel_id)
          .is('archived_at', null)
      }
    }

    await supabase.from('forge_dot_mvr_events').insert({
      organization_id: organizationId,
      company_driver_id: parentId,
      kind: slot === 'mvr_consent' ? 'consent_received' : 'mvr_received',
      note: safeName,
      actor_user_id: context.user.id
    })
  }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.file_added', entityType: 'dot_' + parentType, entityId: parentId, after: { file_id: id, slot, file_name: safeName } })
  revalidatePath('/dot', 'layout')

  return NextResponse.json({ id })
}
