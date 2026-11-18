import { createHash, randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { WC_FORMS_BUCKET, WC_TEMPLATE_MAX_BYTES } from '@/lib/forgeWcForms'
import { inspectWcFormTemplate } from '@/lib/forgeWcFormsPdf'
import { WC_FORM_DEFINITIONS, isWcFormKey } from '@/lib/forgeWcFormsRules'

export const dynamic = 'force-dynamic'

/**
 * Uploads a company's original form PDF as the template for one case form, replacing the current one.
 * Needs workers_comp.configure. The file is kept unchanged in private storage.
 */
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

  if (Number(request.headers.get('content-length') || 0) > WC_TEMPLATE_MAX_BYTES + 100_000) {
    return NextResponse.json({ error: 'Form files must be 5 MB or smaller.' }, { status: 413 })
  }

  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const form = await request.formData()
  const file = form.get('file')
  const formKey = String(form.get('formKey') || '')

  if (!isWcFormKey(formKey)) return NextResponse.json({ error: 'Choose which form this is.' }, { status: 400 })
  if (!(file instanceof File) || file.size < 1) return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 })
  if (file.size > WC_TEMPLATE_MAX_BYTES) return NextResponse.json({ error: 'Form files must be 5 MB or smaller.' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') return NextResponse.json({ error: 'The file must be a PDF.' }, { status: 400 })

  let pages = 0

  try {
    pages = (await inspectWcFormTemplate(bytes)).pages
  } catch (error) {
    const message = error instanceof Error && /one to four pages/.test(error.message) ? error.message : 'The PDF could not be read. Upload an unprotected PDF.'

    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = createServiceRoleClient() as any
  const storagePath = `${organizationId}/templates/${formKey}-${randomUUID()}.pdf`
  const fileName = file.name.replace(/[^A-Za-z0-9._ ()-]/g, '_').slice(0, 255) || `${formKey}.pdf`
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  const { error: uploadError } = await supabase.storage.from(WC_FORMS_BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) return NextResponse.json({ error: 'Unable to store the form.' }, { status: 500 })

  const { data: template, error } = await supabase.rpc('forge_replace_wc_form_template', {
    p_organization_id: organizationId,
    p_form_key: formKey,
    p_title: WC_FORM_DEFINITIONS[formKey].title,
    p_storage_path: storagePath,
    p_file_name: fileName,
    p_size_bytes: bytes.byteLength,
    p_sha256: sha256,
    p_page_count: pages,
    p_actor_user_id: context.user.id
  })

  if (error || !template) {
    await supabase.storage.from(WC_FORMS_BUCKET).remove([storagePath])

    return NextResponse.json({ error: 'Unable to save the form template.' }, { status: 500 })
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.form_template_uploaded',
    entityType: 'workers_comp_form_template',
    entityId: template.id,
    afterValue: { form_key: formKey, file_name: fileName, size_bytes: bytes.byteLength, sha256, pages }
  })

  return NextResponse.json({ id: template.id, message: `${WC_FORM_DEFINITIONS[formKey].title} form uploaded.` })
}
