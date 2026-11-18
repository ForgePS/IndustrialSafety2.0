'use server'

import { createHash, randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { getEmailAdapter } from '@/lib/forgeNotifications'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  WC_FORMS_BUCKET,
  WC_SIGNATURE_MAX_BYTES,
  getActiveWcFormTemplates,
  getWcCaseForm,
  loadWcCaseForViewer,
  prefillWcForm,
  recordWcFormEvent,
  renderWcCaseFormPdf,
  wcFormAccess,
  wcFormErrorMessage
} from '@/lib/forgeWcForms'
import {
  WC_FORM_DEFINITIONS,
  WC_FORM_EMAIL_MAX_OUTSIDE,
  WC_FORM_EMAIL_MAX_TOTAL,
  cleanWcFormFields,
  isWcFormKey,
  parseOutsideEmails,
  wcFormFileName
} from '@/lib/forgeWcFormsRules'
import type { WcFormKey } from '@/lib/forgeWcFormsRules'

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const refresh = (caseId: string, formId?: string) => {
  revalidatePath(`/workers-comp/${caseId}`)
  if (formId) revalidatePath(`/workers-comp/${caseId}/forms/${formId}`)
}

/** Loads the form, its case and the viewer's access. `manage` also requires the case to be open. */
const loadForm = async (formId: string, need: 'view' | 'manage') => {
  const context = await requireTenantPermission('workers_comp.view')
  const organizationId = context.activeOrganization.id
  const form = await getWcCaseForm(organizationId, formId)

  if (!form) return { error: 'Form not found.' as const }

  const record = await loadWcCaseForViewer(context, form.case_id)

  if (!record) return { error: 'Form not found.' as const }

  const access = await wcFormAccess(context, record)

  // Without access the form is reported as missing, so its existence is not revealed.
  if (!access.canView(form.form_key)) return { error: 'Form not found.' as const }
  if (need === 'manage' && !access.canManage(form.form_key)) return { error: 'You do not have permission to change this form.' as const }

  return { context, organizationId, form, record, access }
}

export const createWcCaseForm = async ({ caseId, formKey }: { caseId: string; formKey: string }): Promise<Result> => {
  const context = await requireTenantPermission('workers_comp.view')
  const organizationId = context.activeOrganization.id

  if (!isWcFormKey(formKey)) return { error: 'Unknown form.' }

  const record = await loadWcCaseForViewer(context, caseId)

  if (!record) return { error: 'Case not found.' }

  const access = await wcFormAccess(context, record)

  if (!access.canManage(formKey)) return { error: 'You do not have permission to start this form.' }

  const template = (await getActiveWcFormTemplates(organizationId)).find(item => item.form_key === formKey)

  if (!template) return { error: 'This form is not set up for your company.' }

  const fieldData = await prefillWcForm(organizationId, record, formKey, { includeDateOfBirth: access.canSeeDateOfBirth })

  const { data: form, error } = await db()
    .from('forge_wc_case_forms')
    .insert({
      organization_id: organizationId,
      case_id: caseId,
      template_id: template.id,
      form_key: formKey,
      field_data: fieldData,
      signer_relationship: WC_FORM_DEFINITIONS[formKey].allowRepresentative ? 'Self' : null,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !form) return { error: wcFormErrorMessage(error, 'Unable to start the form.') }

  await recordWcFormEvent(form, 'created', context.user.id, { form_key: formKey })
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.form_created',
    entityType: 'workers_comp_form',
    entityId: form.id,
    afterValue: { case_id: caseId, form_key: formKey }
  })

  refresh(caseId)

  return { id: form.id, message: `${WC_FORM_DEFINITIONS[formKey].title} started.` }
}

export const saveWcCaseFormDraft = async ({
  formId,
  rowVersion,
  fields,
  signerName,
  signerRelationship
}: {
  formId: string
  rowVersion: number
  fields: Record<string, string>
  signerName: string
  signerRelationship: string
}): Promise<Result> => {
  const loaded = await loadForm(formId, 'manage')

  if ('error' in loaded) return { error: loaded.error }

  const { context, form } = loaded

  if (form.status !== 'draft') return { error: 'Only draft forms can be edited.' }

  const cleaned = cleanWcFormFields(form.form_key as WcFormKey, fields || {})

  if (cleaned.errors.length) return { error: cleaned.errors[0] }

  const { data, error } = await db()
    .from('forge_wc_case_forms')
    .update({
      field_data: cleaned.values,
      signer_name: (signerName || '').trim().slice(0, 120) || null,
      signer_relationship: (signerRelationship || '').trim().slice(0, 60) || null,
      updated_by: context.user.id
    })
    .eq('id', formId)
    .eq('row_version', rowVersion)
    .select('id')

  if (error) return { error: wcFormErrorMessage(error) }
  if (!data?.length) return { error: 'This form changed since you opened it. Reload and try again.' }

  await recordWcFormEvent(form, 'updated', context.user.id)
  refresh(form.case_id, formId)

  return { message: 'Draft saved.' }
}

/** Decodes a PNG data URL from the signature pad and checks it really is a PNG of a sensible size. */
const decodeSignature = (dataUrl: string) => {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')

  if (!match) return null

  const bytes = Buffer.from(match[1], 'base64')
  const isPng = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))

  return isPng && bytes.length <= WC_SIGNATURE_MAX_BYTES ? bytes : null
}

export const signWcCaseForm = async ({
  formId,
  rowVersion,
  fields,
  signerName,
  signerRelationship,
  signature
}: {
  formId: string
  rowVersion: number
  fields: Record<string, string>
  signerName: string
  signerRelationship: string
  signature: string
}): Promise<Result> => {
  const loaded = await loadForm(formId, 'manage')

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, form } = loaded
  const definition = WC_FORM_DEFINITIONS[form.form_key as WcFormKey]

  if (form.status !== 'draft') return { error: 'Only draft forms can be signed.' }

  const cleaned = cleanWcFormFields(form.form_key as WcFormKey, fields || {}, { forSigning: true })

  if (cleaned.errors.length) return { error: cleaned.errors[0] }

  const name = (signerName || '').trim()

  if (!name || name.length > 120) return { error: 'Enter the signer\'s printed name.' }

  const relationship = definition.allowRepresentative ? (signerRelationship || '').trim().slice(0, 60) || 'Self' : null
  const png = decodeSignature(signature)

  if (!png) return { error: 'Draw a signature before signing.' }

  const signaturePath = `${organizationId}/${form.case_id}/${form.id}/signature-${randomUUID()}.png`
  const storage = db().storage.from(WC_FORMS_BUCKET)
  const { error: uploadError } = await storage.upload(signaturePath, png, { contentType: 'image/png', upsert: false })

  if (uploadError) return { error: 'Unable to save the signature.' }

  const { error } = await db().rpc('forge_sign_wc_case_form', {
    p_organization_id: organizationId,
    p_form_id: formId,
    p_expected_version: rowVersion,
    p_field_data: cleaned.values,
    p_signer_name: name,
    p_signer_relationship: relationship,
    p_signature_path: signaturePath,
    p_actor_user_id: context.user.id
  })

  if (error) {
    await storage.remove([signaturePath])

    return { error: wcFormErrorMessage(error, 'Unable to sign the form.') }
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.form_signed',
    entityType: 'workers_comp_form',
    entityId: formId,
    afterValue: { case_id: form.case_id, form_key: form.form_key, signer_relationship: relationship }
  })

  // Non-medical forms are noted in case history. HIPAA forms stay out of it, since history is open to all case viewers.
  if (!definition.medical) {
    await db().from('forge_wc_case_activity').insert({
      organization_id: organizationId,
      case_id: form.case_id,
      activity_type: 'form_signed',
      message: `${definition.title} signed by ${name}.`,
      actor_user_id: context.user.id
    })
  }

  refresh(form.case_id, formId)

  return { message: `${definition.title} signed.` }
}

export const voidWcCaseForm = async ({ formId, rowVersion, reason }: { formId: string; rowVersion: number; reason: string }): Promise<Result> => {
  const loaded = await loadForm(formId, 'manage')

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, form } = loaded
  const cleanReason = (reason || '').trim()

  if (cleanReason.length < 3 || cleanReason.length > 500) return { error: 'Give a reason for voiding the form (3 to 500 characters).' }

  const { error } = await db().rpc('forge_void_wc_case_form', {
    p_organization_id: organizationId,
    p_form_id: formId,
    p_expected_version: rowVersion,
    p_reason: cleanReason,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: wcFormErrorMessage(error, 'Unable to void the form.') }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.form_voided',
    entityType: 'workers_comp_form',
    entityId: formId,
    afterValue: { case_id: form.case_id, form_key: form.form_key },
    reason: cleanReason
  })

  refresh(form.case_id, formId)

  return { message: 'Form voided. Start a new one if a corrected copy is needed.' }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Emails the signed form (filled PDF attached) to chosen staff from personnel and/or typed outside addresses.
 * Each recipient gets their own message. Every attempt is recorded on the form's history.
 */
export const emailWcCaseForm = async ({
  formId,
  personnelIds,
  outsideAddresses,
  note
}: {
  formId: string
  personnelIds: string[]
  outsideAddresses: string
  note: string
}): Promise<Result> => {
  const loaded = await loadForm(formId, 'manage')

  if ('error' in loaded) return { error: loaded.error }

  const { context, organizationId, form, record } = loaded
  const definition = WC_FORM_DEFINITIONS[form.form_key as WcFormKey]

  if (form.status !== 'signed') return { error: 'Only signed forms can be emailed.' }

  const outside = parseOutsideEmails(outsideAddresses || '')

  if (outside.invalid.length) return { error: `Not a valid email address: ${outside.invalid.slice(0, 3).join(', ')}` }
  if (outside.valid.length > WC_FORM_EMAIL_MAX_OUTSIDE) return { error: `Use ${WC_FORM_EMAIL_MAX_OUTSIDE} outside addresses or fewer.` }

  const ids = [...new Set((personnelIds || []).filter(id => typeof id === 'string'))].slice(0, WC_FORM_EMAIL_MAX_TOTAL)

  // Staff addresses come from personnel records in this company, never from the browser.
  const { data: staff } = ids.length
    ? await db().from('forge_personnel').select('id, first_name, last_name, email').eq('organization_id', organizationId).in('id', ids).not('email', 'is', null)
    : { data: [] }

  if ((staff || []).length !== ids.length) return { error: 'Some chosen staff have no email address on file.' }

  const recipients = [...new Set([...(staff || []).map((row: any) => String(row.email).trim().toLowerCase()), ...outside.valid])]

  if (!recipients.length) return { error: 'Choose at least one recipient.' }
  if (recipients.length > WC_FORM_EMAIL_MAX_TOTAL) return { error: `Send to ${WC_FORM_EMAIL_MAX_TOTAL} recipients or fewer.` }

  const cleanNote = (note || '').trim().slice(0, 2000)
  const adapter = getEmailAdapter()

  if (!adapter) {
    await recordWcFormEvent(form, 'email_failed', context.user.id, { recipients, reason: 'No email provider is configured.' })

    return { error: 'Email is not set up for Forge yet. Download the PDF and send it another way.' }
  }

  const pdf = await renderWcCaseFormPdf(organizationId, form)
  const fileName = wcFormFileName(record.case_number, form.form_key as WcFormKey)
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const subject = `${context.activeOrganization.name}: ${definition.title} for workers' comp case ${record.case_number}`

  const notice = definition.medical
    ? 'This attachment contains protected health information. If you received it in error, delete it and tell the sender.'
    : 'This attachment is a confidential workers\' compensation record.'

  const text = [cleanNote, `The signed ${definition.title} for workers' comp case ${record.case_number} is attached.`, notice].filter(Boolean).join('\n\n')
  const html = text.split('\n\n').map(part => `<p style="white-space:pre-wrap">${escapeHtml(part)}</p>`).join('')

  const results: Array<{ to: string; ok: boolean; id?: string | null; error?: string }> = []

  for (const to of recipients) {
    const sent = await adapter.send({ to, subject, text, html, attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }] })

    results.push(sent.ok ? { to, ok: true, id: sent.providerMessageId } : { to, ok: false, error: sent.error })
  }

  const delivered = results.filter(item => item.ok)

  const detail = {
    recipients: results,
    staff_personnel_ids: ids,
    outside_count: outside.valid.length,
    provider: adapter.name,
    attachment: { file_name: fileName, size: pdf.byteLength, sha256 },
    note_length: cleanNote.length
  }

  await recordWcFormEvent(form, delivered.length ? 'emailed' : 'email_failed', context.user.id, detail)
  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.form_emailed',
    entityType: 'workers_comp_form',
    entityId: formId,
    afterValue: { case_id: form.case_id, form_key: form.form_key, sent: delivered.length, failed: results.length - delivered.length, recipients: results.map(item => item.to) }
  })

  refresh(form.case_id, formId)

  if (!delivered.length) return { error: 'The email could not be sent. Try again later.' }
  if (delivered.length < results.length) return { message: `Sent to ${delivered.length} of ${results.length} recipients. See the form history for details.` }

  return { message: `Emailed to ${delivered.length} recipient${delivered.length === 1 ? '' : 's'}.` }
}
