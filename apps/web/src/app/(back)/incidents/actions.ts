'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveForm } from '@/lib/forgeForms'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import { createRecordLink } from '@/lib/forgeRecordLinks'
import { createRisk } from '@/lib/forgeRiskRegister'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type IncidentFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const validateConfiguredForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: IncidentFormValues
}) => {
  const form = await getEffectiveForm({
    organizationId,
    formKey: 'incidents.report'
  })

  if (!form) return { error: 'Incident Report form is not configured.' }

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
    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', locationId)
      .eq('is_active', true)
      .maybeSingle()

    if (!data) return 'Selected Location does not belong to this company.'
  }

  if (divisionId) {
    const { data } = await supabase
      .from('divisions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', divisionId)
      .eq('is_active', true)
      .maybeSingle()

    if (!data) return 'Selected Division does not belong to this company.'
  }

  return null
}

const validateReporterPersonnel = async ({
  supabase,
  organizationId,
  personnelId,
  userId,
  scope
}: {
  supabase: any
  organizationId: string
  personnelId: string | null
  userId: string
  scope: string | null
}) => {
  if (!personnelId) return null

  const { data: personnel } = await supabase
    .from('forge_personnel')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .is('archived_at', null)
    .maybeSingle()

  if (!personnel) return 'Selected Personnel record does not belong to this company.'

  const allowed = await personnelRecordWithinScope({
    organizationId,
    userId,
    scope,
    record: personnel
  })

  return allowed ? null : 'Selected Personnel record is outside your Incident access scope.'
}

const buildPayload = (values: IncidentFormValues) => ({
  incident_type: cleanText(values.incident_type) || 'other',
  severity: cleanText(values.severity) || 'minor',
  occurred_at: cleanText(values.occurred_at),
  location_id: cleanText(values.location_id),
  division_id: cleanText(values.division_id),
  reported_by_personnel_id: cleanText(values.reported_by_personnel_id),
  summary: cleanText(values.summary),
  description: cleanText(values.description),
  immediate_actions: cleanText(values.immediate_actions),
  involves_injury: Boolean(values.involves_injury),
  involves_vehicle: Boolean(values.involves_vehicle),
  property_damage: Boolean(values.property_damage)
})

const writeActivity = async ({
  supabase,
  organizationId,
  incidentId,
  actorUserId,
  activityType,
  message,
  metadata = {}
}: {
  supabase: any
  organizationId: string
  incidentId: string
  actorUserId: string
  activityType: string
  message?: string | null
  metadata?: Record<string, unknown>
}) => {
  await supabase.from('forge_incident_activity').insert({
    organization_id: organizationId,
    incident_id: incidentId,
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
  incidentId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  incidentId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'incident',
    entity_id: incidentId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

export const createIncident = async (values: IncidentFormValues) => {
  const context = await requireTenantPermission('incidents.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateConfiguredForm({ organizationId, values })

  if ('error' in validation) return validation

  const payload = buildPayload(values)

  if (!payload.occurred_at || !payload.summary) {
    return { error: 'Date & Time and Summary are required.' }
  }

  const occurredAt = new Date(payload.occurred_at)
  if (Number.isNaN(occurredAt.getTime())) return { error: 'Incident Date & Time is invalid.' }

  const supabase = createServiceRoleClient() as any

  const assignmentError = await validateLocationDivision({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })

  if (assignmentError) return { error: assignmentError }

  const reporterError = await validateReporterPersonnel({
    supabase,
    organizationId,
    personnelId: payload.reported_by_personnel_id,
    userId: context.user.id,
    scope: context.permission.scope
  })

  if (reporterError) return { error: reporterError }

  const scopeAllowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: {
      organization_id: organizationId,
      reported_by_user_id: context.user.id,
      location_id: payload.location_id,
      division_id: payload.division_id
    }
  })

  if (!scopeAllowed) {
    return { error: 'The selected incident assignment is outside your create scope.' }
  }

  const { data: incidentNumber, error: numberError } = await supabase
    .rpc('next_forge_incident_number', { p_organization_id: organizationId })

  if (numberError || !incidentNumber) {
    return { error: numberError?.message ?? 'Unable to generate incident number.' }
  }

  const { data: incident, error } = await supabase
    .from('forge_incidents')
    .insert({
      organization_id: organizationId,
      incident_number: incidentNumber,
      status: 'draft',
      ...payload,
      occurred_at: occurredAt.toISOString(),
      reported_by_user_id: context.user.id,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !incident) return { error: error?.message ?? 'Unable to create incident.' }

  if (payload.reported_by_personnel_id) {
    await supabase.from('forge_incident_people').insert({
      organization_id: organizationId,
      incident_id: incident.id,
      personnel_id: payload.reported_by_personnel_id,
      role: 'reporter',
      created_by: context.user.id
    })
  }

  await writeActivity({
    supabase,
    organizationId,
    incidentId: incident.id,
    actorUserId: context.user.id,
    activityType: 'created',
    message: 'Incident created as draft.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'incident.created',
    incidentId: incident.id,
    after: incident
  })

  revalidatePath('/incidents')
  return { id: incident.id, message: 'Incident created.' }
}

export const updateIncident = async ({
  incidentId,
  values
}: {
  incidentId: string
  values: IncidentFormValues
}) => {
  const context = await requireTenantPermission('incidents.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateConfiguredForm({ organizationId, values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!before) return { error: 'Incident not found.' }
  if (!['draft','returned'].includes(before.status)) {
    return { error: 'Only Draft or Returned incidents can be edited.' }
  }

  const allowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: before
  })

  if (!allowed) return { error: 'This incident is outside your edit scope.' }

  const payload = buildPayload(values)
  if (!payload.occurred_at || !payload.summary) return { error: 'Date & Time and Summary are required.' }

  const occurredAt = new Date(payload.occurred_at)
  if (Number.isNaN(occurredAt.getTime())) return { error: 'Incident Date & Time is invalid.' }

  const assignmentError = await validateLocationDivision({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })

  if (assignmentError) return { error: assignmentError }

  const afterAllowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: {
      ...before,
      location_id: payload.location_id,
      division_id: payload.division_id
    }
  })

  if (!afterAllowed) {
    return { error: 'The new incident assignment would move this record outside your edit scope.' }
  }

  const { data: after, error } = await supabase
    .from('forge_incidents')
    .update({
      ...payload,
      occurred_at: occurredAt.toISOString(),
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update incident.' }

  await writeActivity({
    supabase,
    organizationId,
    incidentId,
    actorUserId: context.user.id,
    activityType: 'updated',
    message: 'Incident details updated.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'incident.updated',
    incidentId,
    before,
    after
  })

  revalidatePath('/incidents')
  revalidatePath('/incidents/' + incidentId)
  return { message: 'Incident updated.' }
}

export const submitIncident = async (incidentId: string) => {
  const context = await requireTenantPermission('incidents.submit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!before) return { error: 'Incident not found.' }
  if (!['draft','returned'].includes(before.status)) return { error: 'This incident cannot be submitted from its current status.' }

  const allowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: before
  })

  if (!allowed) return { error: 'This incident is outside your submit scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_incidents')
    .update({
      status: 'submitted',
      submitted_at: now,
      submitted_by: context.user.id,
      returned_at: null,
      returned_by: null,
      return_reason: null,
      updated_at: now,
      updated_by: context.user.id
    })
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to submit incident.' }

  await writeActivity({
    supabase,
    organizationId,
    incidentId,
    actorUserId: context.user.id,
    activityType: 'submitted',
    message: 'Incident submitted for review.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'incident.submitted',
    incidentId,
    before,
    after
  })

  revalidatePath('/incidents')
  revalidatePath('/incidents/' + incidentId)
  return { message: 'Incident submitted for review.' }
}

export const approveIncident = async (incidentId: string) => {
  const context = await requireTenantPermission('incidents.approve')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!before) return { error: 'Incident not found.' }
  if (before.status !== 'submitted') return { error: 'Only Submitted incidents can be approved.' }

  const allowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: before
  })

  if (!allowed) return { error: 'This incident is outside your approval scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_incidents')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by: context.user.id,
      updated_at: now,
      updated_by: context.user.id
    })
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to approve incident.' }

  await writeActivity({
    supabase,
    organizationId,
    incidentId,
    actorUserId: context.user.id,
    activityType: 'approved',
    message: 'Incident approved.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'incident.approved',
    incidentId,
    before,
    after
  })

  revalidatePath('/incidents')
  revalidatePath('/incidents/' + incidentId)
  return { message: 'Incident approved.' }
}

export const returnIncident = async ({
  incidentId,
  reason
}: {
  incidentId: string
  reason: string
}) => {
  const context = await requireTenantPermission('incidents.approve')
  const organizationId = context.activeOrganization.id
  const cleanReason = reason.trim()

  if (!cleanReason) return { error: 'A return reason is required.' }

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!before) return { error: 'Incident not found.' }
  if (before.status !== 'submitted') return { error: 'Only Submitted incidents can be returned.' }

  const allowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: before
  })

  if (!allowed) return { error: 'This incident is outside your approval scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_incidents')
    .update({
      status: 'returned',
      returned_at: now,
      returned_by: context.user.id,
      return_reason: cleanReason,
      updated_at: now,
      updated_by: context.user.id
    })
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to return incident.' }

  await writeActivity({
    supabase,
    organizationId,
    incidentId,
    actorUserId: context.user.id,
    activityType: 'returned',
    message: cleanReason
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'incident.returned',
    incidentId,
    before,
    after
  })

  revalidatePath('/incidents')
  revalidatePath('/incidents/' + incidentId)
  return { message: 'Incident returned for correction.' }
}

export const closeIncident = async (incidentId: string) => {
  const context = await requireTenantPermission('incidents.close')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!before) return { error: 'Incident not found.' }
  if (before.status !== 'approved') return { error: 'Only Approved incidents can be closed.' }

  const allowed = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident: before
  })

  if (!allowed) return { error: 'This incident is outside your close scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_incidents')
    .update({
      status: 'closed',
      closed_at: now,
      closed_by: context.user.id,
      updated_at: now,
      updated_by: context.user.id
    })
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to close incident.' }

  await writeActivity({
    supabase,
    organizationId,
    incidentId,
    actorUserId: context.user.id,
    activityType: 'closed',
    message: 'Incident closed.'
  })

  await writeAudit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'incident.closed',
    incidentId,
    before,
    after
  })

  revalidatePath('/incidents')
  revalidatePath('/incidents/' + incidentId)
  return { message: 'Incident closed.' }
}

export type CrossModuleActionResult =
  | { ok: true; id: string; message: string }
  | { ok?: false; error: string }

export const createRiskFromIncident = async (
  incidentId: string
): Promise<CrossModuleActionResult> => {
  const context = await requireTenantPermission('incidents.view')
  const createContext = await requireTenantPermission('risk_register.create')

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: incident } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!incident) return { error: 'Incident not found.' }

  const mayView = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident
  })
  if (!mayView) return { error: 'Incident not found.' }

  const locationDivisionError = await validateLocationDivision({
    supabase,
    organizationId,
    locationId: incident.location_id || null,
    divisionId: incident.division_id || null
  })
  if (locationDivisionError) return { error: locationDivisionError }

  const result = await createRisk({
    organizationId,
    userId: createContext.user.id,
    input: {
      title: incident.summary,
      description: incident.description || incident.summary,
      hazardDescription: incident.description || incident.summary || null,
      workArea: null,
      locationId: incident.location_id || null,
      divisionId: incident.division_id || null,
      sourceType: 'incident',
      sourceReference: incident.incident_number,
      status: 'draft'
    }
  })

  if (!result.ok) return { error: result.error }

  const linkResult = await createRecordLink({
    sourceResourceType: 'incident',
    sourceResourceId: incident.id,
    targetResourceType: 'risk_register',
    targetResourceId: result.risk.id,
    relationshipType: 'identified_risk'
  })

  // Prefill Asset links from forge_incident_assets when present.
  const { data: incidentAssets } = await supabase
    .from('forge_incident_assets')
    .select('asset_id')
    .eq('organization_id', organizationId)
    .eq('incident_id', incident.id)

  const assetLinkErrors: string[] = []
  for (const row of incidentAssets || []) {
    const assetId = row?.asset_id
    if (!assetId) continue
    const assetLink = await createRecordLink({
      sourceResourceType: 'risk_register',
      sourceResourceId: result.risk.id,
      targetResourceType: 'asset',
      targetResourceId: assetId,
      relationshipType: 'involves_asset'
    })
    if ('error' in assetLink && assetLink.error) {
      assetLinkErrors.push(String(assetLink.error))
    }
  }

  revalidatePath('/incidents/' + incidentId)
  revalidatePath('/risk-register/' + result.risk.id)

  const warnings: string[] = []
  if ('error' in linkResult && linkResult.error) {
    warnings.push('Source relationship was not created: ' + String(linkResult.error))
  }
  if (assetLinkErrors.length) {
    warnings.push(
      'Asset link(s) were not created: ' + assetLinkErrors.slice(0, 3).join('; ')
    )
  }

  if (warnings.length) {
    return {
      ok: true,
      id: result.risk.id,
      message: 'Risk created. ' + warnings.join(' ')
    }
  }

  return {
    ok: true,
    id: result.risk.id,
    message: 'Risk created from incident.'
  }
}
