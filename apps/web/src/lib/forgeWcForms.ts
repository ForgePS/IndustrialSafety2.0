import { createServiceRoleClient } from '@repo/supabase/server'

import { OSHA_TIME_ZONE } from '@/lib/forgeOsha'
import { zonedDateTimeParts } from '@/lib/forgeOshaRules'
import type { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { wcRecordWithinScope } from '@/lib/forgeWorkersComp'
import { renderFilledWcForm } from '@/lib/forgeWcFormsPdf'
import { WC_FORM_DEFINITIONS, layoutFor, printedValues } from '@/lib/forgeWcFormsRules'
import type { WcFormKey } from '@/lib/forgeWcFormsRules'

/**
 * Workers' comp case forms (server side): access, templates, prefill, PDF rendering and history.
 * Definitions and print positions live in forgeWcFormsRules.ts; the PDF drawing in forgeWcFormsPdf.ts.
 */

export const WC_FORMS_BUCKET = 'forge-wc-forms'
export const WC_TEMPLATE_MAX_BYTES = 5_242_880
export const WC_SIGNATURE_MAX_BYTES = 300_000

type TenantContext = Awaited<ReturnType<typeof requireTenantPermission>>

const db = () => createServiceRoleClient() as any

/** The case, or null when it does not exist in the tenant or is outside the viewer's workers' comp scope. */
export const loadWcCaseForViewer = async (context: TenantContext, caseId: string) => {
  const organizationId = context.activeOrganization.id

  const { data: record } = await db()
    .from('forge_wc_cases')
    .select('id, organization_id, case_number, employee_name, personnel_id, location_id, division_id, status, created_by')
    .eq('organization_id', organizationId)
    .eq('id', caseId)
    .maybeSingle()

  if (!record) return null

  const view = context.access.effective.find(item => item.permissionKey === 'workers_comp.view' && item.allowed)

  if (!view || !(await wcRecordWithinScope({ organizationId, userId: context.user.id, scope: view.scope, record }))) return null

  return record
}

/** What the viewer may do with each form on this case. HIPAA forms follow the medical permissions. */
export const wcFormAccess = async (context: TenantContext, record: any) => {
  const organizationId = context.activeOrganization.id

  const within = async (key: string) => {
    const found = context.access.effective.find(item => item.permissionKey === key && item.allowed)

    return found ? wcRecordWithinScope({ organizationId, userId: context.user.id, scope: found.scope, record }) : false
  }

  const [edit, medicalView, medicalManage] = await Promise.all([
    within('workers_comp.edit'),
    within('workers_comp.medical.view'),
    within('workers_comp.medical.manage')
  ])

  const open = record.status !== 'archived'

  return {
    canView: (formKey: WcFormKey) => !WC_FORM_DEFINITIONS[formKey].medical || Boolean(medicalView || medicalManage),
    canManage: (formKey: WcFormKey) => open && Boolean(WC_FORM_DEFINITIONS[formKey].medical ? medicalManage : edit),
    canSeeDateOfBirth: Boolean(medicalManage)
  }
}

export const getActiveWcFormTemplates = async (organizationId: string) => {
  const { data } = await db()
    .from('forge_wc_form_templates')
    .select('id, form_key, title, file_name, size_bytes, page_count, created_at')
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  return (data || []) as Array<{ id: string; form_key: WcFormKey; title: string; file_name: string; size_bytes: number; page_count: number; created_at: string }>
}

export const getWcCaseForm = async (organizationId: string, formId: string) => {
  const { data } = await db().from('forge_wc_case_forms').select('*').eq('organization_id', organizationId).eq('id', formId).maybeSingle()

  return data
}

/** Starting values for a new form, from the case and (for HIPAA, with medical manage access) the personnel record. */
export const prefillWcForm = async (organizationId: string, record: any, formKey: WcFormKey, { includeDateOfBirth }: { includeDateOfBirth: boolean }) => {
  if (formKey === 'injury_guidelines_ack') return { employee_name: record.employee_name || '' }

  let dateOfBirth = ''

  if (includeDateOfBirth && record.personnel_id) {
    const { data } = await db()
      .from('forge_personnel_sensitive')
      .select('date_of_birth')
      .eq('organization_id', organizationId)
      .eq('personnel_id', record.personnel_id)
      .maybeSingle()

    dateOfBirth = data?.date_of_birth || ''
  }

  return { patient_name: record.employee_name || '', date_of_birth: dateOfBirth }
}

/** The local date (tenant default time zone) a form was signed, as YYYY-MM-DD. */
export const wcFormSignedDate = (signedAt: string | null) => (signedAt ? zonedDateTimeParts(signedAt, OSHA_TIME_ZONE).date : null)

const download = async (path: string) => {
  const { data, error } = await db().storage.from(WC_FORMS_BUCKET).download(path)

  if (error || !data) throw new Error('Unable to read the stored form file.')

  return new Uint8Array(await data.arrayBuffer())
}

export const getWcTemplateFile = async (organizationId: string, templateId: string) => {
  const { data: template } = await db().from('forge_wc_form_templates').select('*').eq('organization_id', organizationId).eq('id', templateId).maybeSingle()

  if (!template) return null

  return { template, bytes: await download(template.storage_path) }
}

/** The filled form drawn on the tenant's original PDF. Drafts print without a signature. */
export const renderWcCaseFormPdf = async (organizationId: string, form: any) => {
  const file = await getWcTemplateFile(organizationId, form.template_id)

  if (!file) throw new Error('The form template is missing.')

  const signaturePng = form.status !== 'draft' && form.signature_path ? await download(form.signature_path) : null

  const values = printedValues(form.form_key, form.field_data || {}, {
    name: form.status !== 'draft' ? form.signer_name : null,
    relationship: form.signer_relationship,
    signedDate: wcFormSignedDate(form.signed_at)
  })

  return renderFilledWcForm({
    templateBytes: file.bytes,
    layout: layoutFor(form.form_key, file.template.layout),
    values,
    signaturePng
  })
}

export const recordWcFormEvent = async (
  form: { id: string; organization_id: string; case_id: string },
  eventType: 'created' | 'updated' | 'printed' | 'downloaded' | 'emailed' | 'email_failed',
  actorUserId: string | null,
  detail: Record<string, unknown> = {}
) => {
  await db().from('forge_wc_case_form_events').insert({
    organization_id: form.organization_id,
    case_id: form.case_id,
    case_form_id: form.id,
    event_type: eventType,
    actor_user_id: actorUserId,
    detail
  })
}

/** Readable messages for database refusals on form writes. */
export const wcFormErrorMessage = (error: { code?: string; message?: string } | null | undefined, fallback = 'Unable to save the form.') => {
  if (!error) return fallback
  if (error.code === '40001') return 'This form changed since you opened it. Reload and try again.'
  if (['42501', '23514', 'P0002', '23503'].includes(error.code || '') && error.message) return error.message

  return fallback
}
