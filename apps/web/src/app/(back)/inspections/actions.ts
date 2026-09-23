'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { inspectionWithinScope } from '@/lib/forgeInspections'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type InspectionFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const writeActivity = async ({
  supabase,
  organizationId,
  inspectionId,
  actorUserId,
  activityType,
  message,
  metadata = {}
}: {
  supabase: any
  organizationId: string
  inspectionId: string
  actorUserId: string
  activityType: string
  message?: string | null
  metadata?: Record<string, unknown>
}) => {
  await supabase.from('forge_inspection_activity').insert({
    organization_id: organizationId,
    inspection_id: inspectionId,
    activity_type: activityType,
    message: message || null,
    actor_user_id: actorUserId,
    metadata
  })
}

const writeAudit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityType,
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const validateForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: InspectionFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey: 'inspections.general' })
  if (!form) return { error: 'General Inspection form is not configured.' }

  for (const field of form.fields) {
    const value = values[field.key]
    if (field.required && (value == null || value === '')) {
      return { error: field.label + ' is required.' }
    }

    if (field.fieldType === 'select' && field.lookupOptions.length && value) {
      if (!field.lookupOptions.some(option => option.key === value)) {
        return { error: field.label + ' contains an invalid option.' }
      }
    }
  }

  return { form }
}

const validateLocationDivision = async ({
  supabase,
  organizationId,
  locationId,
  divisionId
}: {
  supabase: any
  organizationId: string
  locationId: string | null
  divisionId: string | null
}) => {
  if (locationId) {
    const { data } = await supabase.from('locations').select('id').eq('organization_id', organizationId).eq('id', locationId).eq('is_active', true).maybeSingle()
    if (!data) return 'Selected Location does not belong to this company.'
  }

  if (divisionId) {
    const { data } = await supabase.from('divisions').select('id').eq('organization_id', organizationId).eq('id', divisionId).eq('is_active', true).maybeSingle()
    if (!data) return 'Selected Division does not belong to this company.'
  }

  return null
}

const buildInspectionPayload = (values: InspectionFormValues) => ({
  template_id: cleanText(values.template_id),
  inspection_date: cleanText(values.inspection_date),
  location_id: cleanText(values.location_id),
  division_id: cleanText(values.division_id),
  inspector_personnel_id: cleanText(values.inspector_personnel_id),
  result: cleanText(values.result),
  notes: cleanText(values.notes)
})

export const createInspection = async (values: InspectionFormValues) => {
  const context = await requireTenantPermission('inspections.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, values })
  if ('error' in validation) return validation

  const payload = buildInspectionPayload(values)
  if (!payload.template_id || !payload.inspection_date || !payload.location_id) {
    return { error: 'Inspection Template, Inspection Date, and Location are required.' }
  }

  const supabase = createServiceRoleClient() as any

  const [{ data: template }, assignmentError] = await Promise.all([
    supabase
      .from('forge_inspection_templates')
      .select('*, forge_inspection_template_items(*)')
      .eq('organization_id', organizationId)
      .eq('id', payload.template_id)
      .eq('is_active', true)
      .maybeSingle(),
    validateLocationDivision({
      supabase,
      organizationId,
      locationId: payload.location_id,
      divisionId: payload.division_id
    })
  ])

  if (!template) return { error: 'Inspection Template not found.' }
  if (assignmentError) return { error: assignmentError }

  if (payload.inspector_personnel_id) {
    const { data: person } = await supabase
      .from('forge_personnel')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', payload.inspector_personnel_id)
      .is('archived_at', null)
      .maybeSingle()

    if (!person) return { error: 'Inspector Personnel record not found.' }

    const personAllowed = await personnelRecordWithinScope({
      organizationId,
      userId: context.user.id,
      scope: context.permission.scope,
      record: person
    })

    if (!personAllowed) return { error: 'Selected Inspector is outside your access scope.' }
  }

  const scopeAllowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: {
      organization_id: organizationId,
      inspector_user_id: context.user.id,
      location_id: payload.location_id,
      division_id: payload.division_id
    }
  })

  if (!scopeAllowed) return { error: 'The selected inspection assignment is outside your create scope.' }

  const { data: inspectionNumber, error: numberError } = await supabase
    .rpc('next_forge_inspection_number', { p_organization_id: organizationId })

  if (numberError || !inspectionNumber) {
    return { error: numberError?.message ?? 'Unable to generate inspection number.' }
  }

  const { data: inspection, error } = await supabase
    .from('forge_inspections')
    .insert({
      organization_id: organizationId,
      inspection_number: inspectionNumber,
      template_id: template.id,
      template_name_snapshot: template.name,
      template_version_snapshot: template.version,
      status: 'draft',
      inspection_date: payload.inspection_date,
      location_id: payload.location_id,
      division_id: payload.division_id,
      inspector_user_id: context.user.id,
      inspector_personnel_id: payload.inspector_personnel_id,
      result: payload.result,
      notes: payload.notes,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !inspection) return { error: error?.message ?? 'Unable to create inspection.' }

  const templateItems = (template.forge_inspection_template_items || [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)

  if (templateItems.length) {
    const { error: itemsError } = await supabase.from('forge_inspection_items').insert(
      templateItems.map((item: any) => ({
        organization_id: organizationId,
        inspection_id: inspection.id,
        template_item_id: item.id,
        item_key: item.item_key,
        section_key: item.section_key,
        section_label: item.section_label,
        prompt: item.prompt,
        guidance: item.guidance,
        response_type: item.response_type,
        sort_order: item.sort_order,
        is_required: item.is_required,
        finding_on: item.finding_on
      }))
    )

    if (itemsError) {
      await supabase.from('forge_inspections').delete().eq('id', inspection.id)
      return { error: itemsError.message }
    }
  }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId: inspection.id,
    actorUserId: context.user.id,
    activityType: 'created',
    message: 'Inspection created from template ' + template.name + '.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.created',
    entityType: 'inspection',
    entityId: inspection.id,
    after: inspection
  })

  revalidatePath('/inspections')
  return { id: inspection.id, message: 'Inspection created.' }
}

export const updateInspection = async ({
  inspectionId,
  values
}: {
  inspectionId: string
  values: InspectionFormValues
}) => {
  const context = await requireTenantPermission('inspections.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, values })
  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle()
  if (!before) return { error: 'Inspection not found.' }
  if (!['draft','in_progress','returned'].includes(before.status)) return { error: 'This inspection is read-only in its current status.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: before
  })
  if (!allowed) return { error: 'This inspection is outside your edit scope.' }

  const payload = buildInspectionPayload(values)

  const assignmentError = await validateLocationDivision({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })
  if (assignmentError) return { error: assignmentError }

  const { data: after, error } = await supabase
    .from('forge_inspections')
    .update({
      inspection_date: payload.inspection_date || before.inspection_date,
      location_id: payload.location_id,
      division_id: payload.division_id,
      inspector_personnel_id: payload.inspector_personnel_id,
      result: payload.result,
      notes: payload.notes,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', inspectionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update inspection.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType: 'updated',
    message: 'Inspection details updated.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.updated',
    entityType: 'inspection',
    entityId: inspectionId,
    before,
    after
  })

  revalidatePath('/inspections')
  revalidatePath('/inspections/' + inspectionId)
  return { message: 'Inspection updated.' }
}

export const saveInspectionItem = async ({
  inspectionId,
  itemId,
  responseValue,
  notes
}: {
  inspectionId: string
  itemId: string
  responseValue: string
  notes: string
}) => {
  const context = await requireTenantPermission('inspections.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: inspection }, { data: item }] = await Promise.all([
    supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle(),
    supabase.from('forge_inspection_items').select('*').eq('organization_id', organizationId).eq('inspection_id', inspectionId).eq('id', itemId).maybeSingle()
  ])

  if (!inspection || !item) return { error: 'Inspection item not found.' }
  if (!['draft','in_progress','returned'].includes(inspection.status)) return { error: 'This checklist is read-only in its current status.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection
  })
  if (!allowed) return { error: 'This inspection is outside your edit scope.' }

  const allowedResponses: Record<string, string[]> = {
    pass_fail_na: ['pass','fail','na'],
    yes_no_na: ['yes','no','na']
  }

  if (allowedResponses[item.response_type] && !allowedResponses[item.response_type].includes(responseValue)) {
    return { error: 'Invalid checklist response.' }
  }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_inspection_items')
    .update({
      response_value: responseValue || null,
      notes: notes.trim() || null,
      responded_by: context.user.id,
      responded_at: now
    })
    .eq('id', itemId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to save checklist item.' }

  if (inspection.status === 'draft' || inspection.status === 'returned') {
    await supabase
      .from('forge_inspections')
      .update({
        status: 'in_progress',
        started_at: inspection.started_at || now,
        returned_at: null,
        returned_by: null,
        return_reason: null,
        updated_by: context.user.id,
        updated_at: now
      })
      .eq('id', inspectionId)
  }

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.item_updated',
    entityType: 'inspection_item',
    entityId: itemId,
    before: item,
    after
  })

  revalidatePath('/inspections/' + inspectionId)
  return { message: 'Checklist item saved.' }
}

export const createInspectionFinding = async ({
  inspectionId,
  itemId,
  title,
  description,
  severity,
  dueDate
}: {
  inspectionId: string
  itemId?: string | null
  title: string
  description: string
  severity: string
  dueDate?: string | null
}) => {
  const context = await requireTenantPermission('inspections.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: inspection } = await supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle()
  if (!inspection) return { error: 'Inspection not found.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection
  })
  if (!allowed) return { error: 'This inspection is outside your edit scope.' }

  if (!title.trim()) return { error: 'Finding title is required.' }

  const severityLookup = await getEffectiveLookup({
    organizationId,
    lookupKey: 'inspections.finding_severity'
  })

  if (!severityLookup.options.some(option => option.key === severity)) {
    return { error: 'Invalid finding severity.' }
  }

  if (itemId) {
    const { data: item } = await supabase.from('forge_inspection_items').select('id').eq('organization_id', organizationId).eq('inspection_id', inspectionId).eq('id', itemId).maybeSingle()
    if (!item) return { error: 'Checklist item not found.' }
  }

  const { data: finding, error } = await supabase
    .from('forge_inspection_findings')
    .insert({
      organization_id: organizationId,
      inspection_id: inspectionId,
      inspection_item_id: itemId || null,
      title: title.trim(),
      description: description.trim() || null,
      severity,
      status: 'open',
      due_date: dueDate || null,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !finding) return { error: error?.message ?? 'Unable to create finding.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType: 'finding_created',
    message: 'Finding created: ' + finding.title,
    metadata: { finding_id: finding.id, severity: finding.severity }
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.finding_created',
    entityType: 'inspection_finding',
    entityId: finding.id,
    after: finding
  })

  revalidatePath('/inspections/' + inspectionId)
  return { id: finding.id, message: 'Finding created.' }
}

export const updateInspectionFinding = async ({
  findingId,
  correctiveAction,
  status,
  dueDate
}: {
  findingId: string
  correctiveAction: string
  status: 'open' | 'in_progress' | 'pending_verification'
  dueDate?: string | null
}) => {
  const context = await requireTenantPermission('inspections.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_inspection_findings')
    .select('*, forge_inspections(*)')
    .eq('organization_id', organizationId)
    .eq('id', findingId)
    .maybeSingle()

  if (!before || !before.forge_inspections) return { error: 'Finding not found.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: before.forge_inspections
  })
  if (!allowed) return { error: 'This finding is outside your edit scope.' }

  const { data: after, error } = await supabase
    .from('forge_inspection_findings')
    .update({
      corrective_action: correctiveAction.trim() || null,
      status,
      due_date: dueDate || null,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', findingId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update finding.' }

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.finding_updated',
    entityType: 'inspection_finding',
    entityId: findingId,
    before,
    after
  })

  revalidatePath('/inspections/' + after.inspection_id)
  return { message: 'Finding updated.' }
}

export const closeInspectionFinding = async ({
  findingId,
  verificationNotes
}: {
  findingId: string
  verificationNotes: string
}) => {
  const context = await requireTenantPermission('inspections.close_findings')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_inspection_findings')
    .select('*, forge_inspections(*)')
    .eq('organization_id', organizationId)
    .eq('id', findingId)
    .maybeSingle()

  if (!before || !before.forge_inspections) return { error: 'Finding not found.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: before.forge_inspections
  })
  if (!allowed) return { error: 'This finding is outside your close scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_inspection_findings')
    .update({
      status: 'closed',
      verification_notes: verificationNotes.trim() || null,
      closed_at: now,
      closed_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', findingId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to close finding.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId: after.inspection_id,
    actorUserId: context.user.id,
    activityType: 'finding_closed',
    message: 'Finding closed: ' + after.title,
    metadata: { finding_id: after.id }
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.finding_closed',
    entityType: 'inspection_finding',
    entityId: findingId,
    before,
    after
  })

  revalidatePath('/inspections/' + after.inspection_id)
  return { message: 'Finding verified and closed.' }
}

const transitionInspection = async ({
  permissionKey,
  inspectionId,
  requiredStatus,
  nextStatus,
  activityType,
  action,
  message,
  extra = {}
}: {
  permissionKey: string
  inspectionId: string
  requiredStatus: string | string[]
  nextStatus: string
  activityType: string
  action: string
  message: string
  extra?: Record<string, unknown>
}) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle()

  if (!before) return { error: 'Inspection not found.' }

  const validStates = Array.isArray(requiredStatus) ? requiredStatus : [requiredStatus]
  if (!validStates.includes(before.status)) return { error: 'This inspection cannot perform that action from its current status.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: before
  })
  if (!allowed) return { error: 'This inspection is outside your permission scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_inspections')
    .update({
      status: nextStatus,
      updated_by: context.user.id,
      updated_at: now,
      ...extra
    })
    .eq('id', inspectionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update inspection workflow.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType,
    message
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action,
    entityType: 'inspection',
    entityId: inspectionId,
    before,
    after
  })

  revalidatePath('/inspections')
  revalidatePath('/inspections/' + inspectionId)
  return { message }
}

export const submitInspection = async (inspectionId: string) => {
  const context = await requireTenantPermission('inspections.submit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: inspection }, { data: items }] = await Promise.all([
    supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle(),
    supabase.from('forge_inspection_items').select('*').eq('organization_id', organizationId).eq('inspection_id', inspectionId)
  ])

  if (!inspection) return { error: 'Inspection not found.' }
  if (!['draft','in_progress','returned'].includes(inspection.status)) return { error: 'This inspection cannot be submitted from its current status.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection
  })
  if (!allowed) return { error: 'This inspection is outside your submit scope.' }

  const missing = (items || []).filter((item: any) => item.is_required && !item.response_value)
  if (missing.length) return { error: String(missing.length) + ' required checklist item(s) still need a response.' }

  const anyFail = (items || []).some((item: any) => item.response_value === 'fail' || item.response_value === 'no')
  const { count: openFindings } = await supabase
    .from('forge_inspection_findings')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('inspection_id', inspectionId)
    .not('status', 'in', '("closed","canceled")')

  const computedResult = anyFail ? 'fail' : (openFindings || 0) > 0 ? 'needs_attention' : 'pass'
  const now = new Date().toISOString()

  const { data: after, error } = await supabase
    .from('forge_inspections')
    .update({
      status: 'submitted',
      result: computedResult,
      completed_at: now,
      submitted_at: now,
      submitted_by: context.user.id,
      returned_at: null,
      returned_by: null,
      return_reason: null,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', inspectionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to submit inspection.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType: 'submitted',
    message: 'Inspection submitted for review.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.submitted',
    entityType: 'inspection',
    entityId: inspectionId,
    before: inspection,
    after
  })

  revalidatePath('/inspections')
  revalidatePath('/inspections/' + inspectionId)
  return { message: 'Inspection submitted for review.' }
}

export const approveInspection = async (inspectionId: string) => {
  const context = await requireTenantPermission('inspections.approve')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_inspections')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', inspectionId)
    .maybeSingle()

  if (!before) return { error: 'Inspection not found.' }
  if (before.status !== 'submitted') return { error: 'Only Submitted inspections can be approved.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: before
  })

  if (!allowed) return { error: 'This inspection is outside your approval scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_inspections')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', inspectionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to approve inspection.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType: 'approved',
    message: 'Inspection approved.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.approved',
    entityType: 'inspection',
    entityId: inspectionId,
    before,
    after
  })

  revalidatePath('/inspections')
  revalidatePath('/inspections/' + inspectionId)
  return { message: 'Inspection approved.' }
}

export const returnInspection = async ({
  inspectionId,
  reason
}: {
  inspectionId: string
  reason: string
}) => {
  const context = await requireTenantPermission('inspections.approve')
  const organizationId = context.activeOrganization.id
  const cleanReason = reason.trim()
  if (!cleanReason) return { error: 'A return reason is required.' }

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle()
  if (!before) return { error: 'Inspection not found.' }
  if (before.status !== 'submitted') return { error: 'Only Submitted inspections can be returned.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection: before
  })
  if (!allowed) return { error: 'This inspection is outside your approval scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_inspections')
    .update({
      status: 'returned',
      returned_at: now,
      returned_by: context.user.id,
      return_reason: cleanReason,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', inspectionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to return inspection.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType: 'returned',
    message: cleanReason
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.returned',
    entityType: 'inspection',
    entityId: inspectionId,
    before,
    after
  })

  revalidatePath('/inspections')
  revalidatePath('/inspections/' + inspectionId)
  return { message: 'Inspection returned for correction.' }
}

export const closeInspection = async (inspectionId: string) => {
  const context = await requireTenantPermission('inspections.close')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: inspection }, { count: openFindings }] = await Promise.all([
    supabase.from('forge_inspections').select('*').eq('organization_id', organizationId).eq('id', inspectionId).maybeSingle(),
    supabase
      .from('forge_inspection_findings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('inspection_id', inspectionId)
      .not('status', 'in', '("closed","canceled")')
  ])

  if (!inspection) return { error: 'Inspection not found.' }
  if (inspection.status !== 'approved') return { error: 'Only Approved inspections can be closed.' }
  if ((openFindings || 0) > 0) return { error: 'All findings must be closed or canceled before closing the inspection.' }

  const allowed = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection
  })
  if (!allowed) return { error: 'This inspection is outside your close scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_inspections')
    .update({
      status: 'closed',
      closed_at: now,
      closed_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', inspectionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to close inspection.' }

  await writeActivity({
    supabase,
    organizationId,
    inspectionId,
    actorUserId: context.user.id,
    activityType: 'closed',
    message: 'Inspection closed.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'inspection.closed',
    entityType: 'inspection',
    entityId: inspectionId,
    before: inspection,
    after
  })

  revalidatePath('/inspections')
  revalidatePath('/inspections/' + inspectionId)
  return { message: 'Inspection closed.' }
}
