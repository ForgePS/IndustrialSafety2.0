'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveForm } from '@/lib/forgeForms'
import { assetWithinScope } from '@/lib/forgeAssets'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type AssetFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const cleanNumber = (value: unknown) => {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const validateForm = async ({
  organizationId,
  formKey,
  values
}: {
  organizationId: string
  formKey: string
  values: AssetFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey })
  if (!form) return { error: 'Asset form is not configured.' }

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

const audit = async ({
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

const activity = async ({
  supabase,
  organizationId,
  assetId,
  userId,
  type,
  message,
  metadata = {}
}: {
  supabase: any
  organizationId: string
  assetId: string
  userId: string
  type: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  await supabase.from('forge_asset_activity').insert({
    organization_id: organizationId,
    asset_id: assetId,
    activity_type: type,
    message,
    actor_user_id: userId,
    metadata
  })
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

const resolveCustodian = async ({
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
  if (!personnelId) {
    return {
      personnelId: null,
      custodianUserId: scope === 'own' || scope === 'assigned' ? userId : null
    }
  }

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) return { error: 'Selected Custodian does not belong to this company.' }

  const allowed = await personnelRecordWithinScope({
    organizationId,
    userId,
    scope,
    record: person
  })

  if (!allowed) return { error: 'Selected Custodian is outside your access scope.' }

  return {
    personnelId: person.id,
    custodianUserId: person.auth_user_id || (scope === 'own' || scope === 'assigned' ? userId : null)
  }
}

const buildAssetPayload = (values: AssetFormValues) => ({
  name: cleanText(values.name),
  asset_type: cleanText(values.asset_type) || 'equipment',
  status: cleanText(values.status) || 'active',
  condition: cleanText(values.condition) || 'good',
  criticality: cleanText(values.criticality) || 'standard',
  description: cleanText(values.description),
  manufacturer: cleanText(values.manufacturer),
  model: cleanText(values.model),
  serial_number: cleanText(values.serial_number),
  barcode: cleanText(values.barcode),
  location_id: cleanText(values.location_id),
  division_id: cleanText(values.division_id),
  custodian_personnel_id: cleanText(values.custodian_personnel_id),
  purchase_date: cleanText(values.purchase_date),
  in_service_date: cleanText(values.in_service_date),
  warranty_expires_on: cleanText(values.warranty_expires_on),
  purchase_cost: cleanNumber(values.purchase_cost),
  replacement_cost: cleanNumber(values.replacement_cost)
})

export const createAsset = async (values: AssetFormValues) => {
  const context = await requireTenantPermission('assets_equipment.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'assets.profile', values })
  if ('error' in validation) return validation

  const payload = buildAssetPayload(values)
  if (!payload.name) return { error: 'Asset Name is required.' }

  const supabase = createServiceRoleClient() as any

  const assignmentError = await validateLocationDivision({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })
  if (assignmentError) return { error: assignmentError }

  const custodian = await resolveCustodian({
    supabase,
    organizationId,
    personnelId: payload.custodian_personnel_id,
    userId: context.user.id,
    scope: context.permission.scope
  })
  if ('error' in custodian) return custodian

  const scopeAllowed = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset: {
      organization_id: organizationId,
      custodian_user_id: custodian.custodianUserId,
      location_id: payload.location_id,
      division_id: payload.division_id
    }
  })

  if (!scopeAllowed) return { error: 'The selected asset assignment is outside your create scope.' }

  const { data: assetNumber, error: numberError } = await supabase.rpc('next_forge_asset_number', {
    p_organization_id: organizationId
  })
  if (numberError || !assetNumber) return { error: numberError?.message ?? 'Unable to generate asset number.' }

  const { data: asset, error } = await supabase
    .from('forge_assets')
    .insert({
      organization_id: organizationId,
      asset_number: assetNumber,
      ...payload,
      custodian_personnel_id: custodian.personnelId,
      custodian_user_id: custodian.custodianUserId,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !asset) return { error: error?.message ?? 'Unable to create asset.' }

  if (asset.location_id || asset.division_id || asset.custodian_personnel_id) {
    await supabase.from('forge_asset_assignments').insert({
      organization_id: organizationId,
      asset_id: asset.id,
      personnel_id: asset.custodian_personnel_id,
      user_id: asset.custodian_user_id,
      location_id: asset.location_id,
      division_id: asset.division_id,
      assignment_type: asset.custodian_personnel_id ? 'custody' : asset.location_id ? 'location' : 'division',
      assigned_by: context.user.id,
      notes: 'Initial asset assignment.'
    })
  }

  await activity({
    supabase,
    organizationId,
    assetId: asset.id,
    userId: context.user.id,
    type: 'created',
    message: 'Asset created.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'asset.created',
    entityType: 'asset',
    entityId: asset.id,
    after: asset
  })

  revalidatePath('/assets')
  return { id: asset.id, message: 'Asset created.' }
}

export const updateAsset = async ({
  assetId,
  values
}: {
  assetId: string
  values: AssetFormValues
}) => {
  const context = await requireTenantPermission('assets_equipment.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'assets.profile', values })
  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase.from('forge_assets').select('*').eq('organization_id', organizationId).eq('id', assetId).maybeSingle()
  if (!before) return { error: 'Asset not found.' }
  if (before.retired_at) return { error: 'Retired assets are read-only.' }

  const allowed = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset: before
  })
  if (!allowed) return { error: 'This asset is outside your edit scope.' }

  const payload = buildAssetPayload(values)
  if (!payload.name) return { error: 'Asset Name is required.' }

  const assignmentChanged =
    payload.location_id !== before.location_id ||
    payload.division_id !== before.division_id ||
    payload.custodian_personnel_id !== before.custodian_personnel_id

  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'assets_equipment.assign' && item.allowed
  )

  if (assignmentChanged && !assignPermission) {
    return { error: 'You do not have permission to change asset assignment.' }
  }

  const assignmentError = await validateLocationDivision({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })
  if (assignmentError) return { error: assignmentError }

  let custodianUserId = before.custodian_user_id
  let custodianPersonnelId = payload.custodian_personnel_id

  if (assignmentChanged) {
    const custodian = await resolveCustodian({
      supabase,
      organizationId,
      personnelId: payload.custodian_personnel_id,
      userId: context.user.id,
      scope: assignPermission?.scope || context.permission.scope
    })
    if ('error' in custodian) return custodian
    custodianUserId = custodian.custodianUserId
    custodianPersonnelId = custodian.personnelId

    const assignmentAllowed = await assetWithinScope({
      organizationId,
      userId: context.user.id,
      scope: assignPermission?.scope || context.permission.scope,
      asset: {
        organization_id: organizationId,
        custodian_user_id: custodianUserId,
        location_id: payload.location_id,
        division_id: payload.division_id
      }
    })

    if (!assignmentAllowed) return { error: 'The new asset assignment is outside your assignment scope.' }
  }

  const { data: after, error } = await supabase
    .from('forge_assets')
    .update({
      ...payload,
      custodian_personnel_id: custodianPersonnelId,
      custodian_user_id: custodianUserId,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', assetId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update asset.' }

  if (assignmentChanged) {
    const now = new Date().toISOString()

    await supabase
      .from('forge_asset_assignments')
      .update({
        returned_at: now,
        returned_by: context.user.id
      })
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .is('returned_at', null)

    await supabase.from('forge_asset_assignments').insert({
      organization_id: organizationId,
      asset_id: assetId,
      personnel_id: custodianPersonnelId,
      user_id: custodianUserId,
      location_id: payload.location_id,
      division_id: payload.division_id,
      assignment_type: custodianPersonnelId ? 'custody' : payload.location_id ? 'location' : 'division',
      assigned_by: context.user.id,
      notes: 'Asset assignment updated.'
    })

    await activity({
      supabase,
      organizationId,
      assetId,
      userId: context.user.id,
      type: 'assignment_changed',
      message: 'Asset assignment changed.'
    })
  }

  await activity({
    supabase,
    organizationId,
    assetId,
    userId: context.user.id,
    type: 'updated',
    message: 'Asset details updated.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'asset.updated',
    entityType: 'asset',
    entityId: assetId,
    before,
    after
  })

  revalidatePath('/assets')
  revalidatePath('/assets/' + assetId)
  return { message: 'Asset updated.' }
}

export const retireAsset = async ({
  assetId,
  reason
}: {
  assetId: string
  reason: string
}) => {
  const context = await requireTenantPermission('assets_equipment.retire')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase.from('forge_assets').select('*').eq('organization_id', organizationId).eq('id', assetId).maybeSingle()
  if (!before) return { error: 'Asset not found.' }
  if (before.retired_at) return { error: 'Asset is already retired.' }

  const allowed = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset: before
  })
  if (!allowed) return { error: 'This asset is outside your retire scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_assets')
    .update({
      status: 'retired',
      retired_at: now,
      retired_by: context.user.id,
      retirement_reason: reason.trim() || null,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', assetId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to retire asset.' }

  await supabase
    .from('forge_asset_assignments')
    .update({ returned_at: now, returned_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('asset_id', assetId)
    .is('returned_at', null)

  await activity({
    supabase,
    organizationId,
    assetId,
    userId: context.user.id,
    type: 'retired',
    message: reason.trim() ? 'Asset retired: ' + reason.trim() : 'Asset retired.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'asset.retired',
    entityType: 'asset',
    entityId: assetId,
    before,
    after
  })

  revalidatePath('/assets')
  revalidatePath('/assets/' + assetId)
  return { message: 'Asset retired.' }
}

export const createAssetMaintenance = async ({
  assetId,
  values
}: {
  assetId: string
  values: AssetFormValues
}) => {
  const context = await requireTenantPermission('assets_equipment.maintenance')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'assets.maintenance', values })
  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: asset } = await supabase.from('forge_assets').select('*').eq('organization_id', organizationId).eq('id', assetId).maybeSingle()
  if (!asset) return { error: 'Asset not found.' }

  const allowed = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset
  })
  if (!allowed) return { error: 'This asset is outside your maintenance scope.' }

  const maintenanceType = cleanText(values.maintenance_type)
  const status = cleanText(values.status) || 'completed'
  const description = cleanText(values.description)
  if (!maintenanceType || !description) return { error: 'Maintenance Type and Work Description are required.' }

  const laborCost = cleanNumber(values.labor_cost)
  const partsCost = cleanNumber(values.parts_cost)

  const { data: record, error } = await supabase
    .from('forge_asset_maintenance')
    .insert({
      organization_id: organizationId,
      asset_id: assetId,
      maintenance_type: maintenanceType,
      status,
      scheduled_for: cleanText(values.scheduled_for),
      performed_on: cleanText(values.performed_on),
      vendor: cleanText(values.vendor),
      technician: cleanText(values.technician),
      work_order_number: cleanText(values.work_order_number),
      description,
      findings: cleanText(values.findings),
      corrective_action: cleanText(values.corrective_action),
      labor_cost: laborCost,
      parts_cost: partsCost,
      total_cost: (laborCost || 0) + (partsCost || 0),
      next_due_date: cleanText(values.next_due_date),
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !record) return { error: error?.message ?? 'Unable to save maintenance record.' }

  await activity({
    supabase,
    organizationId,
    assetId,
    userId: context.user.id,
    type: 'maintenance_recorded',
    message: 'Maintenance recorded: ' + description,
    metadata: { maintenance_id: record.id, status: record.status }
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'asset.maintenance_created',
    entityType: 'asset_maintenance',
    entityId: record.id,
    after: record
  })

  revalidatePath('/assets/' + assetId)
  return { id: record.id, message: 'Maintenance record saved.' }
}

export const createAssetMeterReading = async ({
  assetId,
  values
}: {
  assetId: string
  values: AssetFormValues
}) => {
  const context = await requireTenantPermission('assets_equipment.meter')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, formKey: 'assets.meter_reading', values })
  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: asset } = await supabase.from('forge_assets').select('*').eq('organization_id', organizationId).eq('id', assetId).maybeSingle()
  if (!asset) return { error: 'Asset not found.' }

  const allowed = await assetWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    asset
  })
  if (!allowed) return { error: 'This asset is outside your meter-reading scope.' }

  const meterType = cleanText(values.meter_type)
  const reading = cleanNumber(values.reading)
  const recordedAt = cleanText(values.recorded_at)

  if (!meterType || reading == null || !recordedAt) {
    return { error: 'Meter Type, Reading, and Recorded Date & Time are required.' }
  }

  const { data: latest } = await supabase
    .from('forge_asset_meter_readings')
    .select('reading')
    .eq('organization_id', organizationId)
    .eq('asset_id', assetId)
    .eq('meter_type', meterType)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest && Number(reading) < Number(latest.reading)) {
    return { error: 'The new reading cannot be lower than the most recent reading for this meter type.' }
  }

  const { data: record, error } = await supabase
    .from('forge_asset_meter_readings')
    .insert({
      organization_id: organizationId,
      asset_id: assetId,
      meter_type: meterType,
      reading,
      unit: cleanText(values.unit),
      recorded_at: new Date(recordedAt).toISOString(),
      notes: cleanText(values.notes),
      recorded_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !record) return { error: error?.message ?? 'Unable to record meter reading.' }

  await activity({
    supabase,
    organizationId,
    assetId,
    userId: context.user.id,
    type: 'meter_reading',
    message: 'Meter reading recorded: ' + String(reading),
    metadata: { meter_reading_id: record.id, meter_type: meterType }
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'asset.meter_reading_created',
    entityType: 'asset_meter_reading',
    entityId: record.id,
    after: record
  })

  revalidatePath('/assets/' + assetId)
  return { id: record.id, message: 'Meter reading saved.' }
}
