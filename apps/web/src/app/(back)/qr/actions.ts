'use server'

import { randomBytes } from 'crypto'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { assetWithinScope } from '@/lib/forgeAssets'
import { isRemovedStatus, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { getEffectiveForm } from '@/lib/forgeForms'
import { locationWithinScope, qrCodeWithinScope } from '@/lib/forgeQr'
import { allowedQrDefaultActions, qrConfigReferences } from '@/lib/forgeQrDestination'
import { SCAN_FREQUENCY_LABELS, SCAN_TARGET_TYPES, parseQrActionConfig, parseScanAccessMode, SCAN_ACCESS_MODES } from '@/lib/forgeScanRules'
import type { QrActionConfig, ScanFrequency } from '@/lib/forgeScanRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { writeAreaActivity } from '@/lib/forgeWaypoint'

export type QrFormValues = Record<string, string | boolean | null>

/** Scan settings edited outside the configurable qr.profile form: target, access mode and action config. */
export type QrScanSettings = {
  targetType: string
  targetId: string
  accessMode: string
  actionConfig: unknown
}

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()


  return cleaned ? cleaned : null
}

const validateForm = async ({
  organizationId,
  values,
  targetType
}: {
  organizationId: string
  values: QrFormValues
  targetType: string
}) => {
  const form = await getEffectiveForm({ organizationId, formKey: 'qr.profile' })

  if (!form) return { error: 'Managed QR Code form is not configured.' }

  for (const field of form.fields) {
    // The linked-asset field is replaced by the target picker for location and form QRs.
    if (field.key === 'asset_id' && targetType !== 'asset') continue

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
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'managed_qr_code',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const AUDITED_FIELDS = ['name', 'description', 'status', 'target_type', 'target_id', 'default_action', 'access_mode', 'action_config', 'expires_at'] as const

const changedFields = (before: any, after: any) =>
  AUDITED_FIELDS.filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null))

type ValidatedTarget = { type: string; id: string; label: string }

const validateTarget = async ({
  supabase,
  organizationId,
  userId,
  scope,
  targetType,
  targetId,
  current
}: {
  supabase: any
  organizationId: string
  userId: string
  scope: string | null
  targetType: string
  targetId: string | null
  current?: { target_type: string; target_id: string } | null
}): Promise<{ target: ValidatedTarget } | { error: string }> => {
  if (!(SCAN_TARGET_TYPES as readonly string[]).includes(targetType)) return { error: 'Choose what this QR code points to.' }

  if (!targetId) {
    return {
      error:
        targetType === 'asset'
          ? 'Linked Asset is required.'
          : targetType === 'location'
            ? 'Choose a location.'
            : targetType === 'vehicle'
              ? 'Choose a vehicle.'
              : targetType === 'area'
                ? 'Choose an area.'
                : 'Choose a form.'
    }
  }

  const unchanged = current?.target_type === targetType && current?.target_id === targetId

  if (targetType === 'area') {
    // Waypoint Area Card: the area must be active and its location inside the user's QR Management scope.
    const { data: area } = await supabase
      .from('forge_areas')
      .select('id, name, location_id, archived_at, locations(name)')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    if (!area) return { error: 'Area was not found.' }
    if (area.archived_at) return { error: 'This area is archived.' }

    if (!(await locationWithinScope({ organizationId, userId, scope, locationId: area.location_id }))) {
      return { error: 'This area is outside your QR Management scope.' }
    }

    return { target: { type: 'area', id: area.id, label: [area.name, area.locations?.name].filter(Boolean).join(' · ') } }
  }

  if (targetType === 'asset') {
    const { data: asset } = await supabase
      .from('forge_assets')
      .select('id, organization_id, name, asset_number, custodian_user_id, location_id, division_id, retired_at')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    if (!asset) return { error: 'Linked Asset was not found.' }
    if (!(await assetWithinScope({ organizationId, userId, scope, asset }))) return { error: 'Linked Asset is outside your QR Management scope.' }

    return { target: { type: 'asset', id: asset.id, label: asset.asset_number + ' · ' + asset.name } }
  }

  if (targetType === 'location') {
    const { data: location } = await supabase
      .from('locations')
      .select('id, name, is_active')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    if (!location) return { error: 'Location was not found.' }
    if (!location.is_active && !unchanged) return { error: 'This location is inactive.' }

    if (!(await locationWithinScope({ organizationId, userId, scope, locationId: location.id }))) {
      return { error: 'This location is outside your QR Management scope.' }
    }

    return { target: { type: 'location', id: location.id, label: location.name } }
  }

  if (targetType === 'vehicle') {
    const { data: vehicle } = await supabase
      .from('forge_fleet_vehicles')
      .select('id, organization_id, vehicle_number, unit_number, year, make, model, status, archived_at, location_id, division_id, assigned_driver_personnel_id')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    if (!vehicle) return { error: 'Vehicle was not found.' }
    if ((vehicle.archived_at || isRemovedStatus(vehicle.status)) && !unchanged) return { error: 'This vehicle has been removed from the fleet.' }
    if (!(await vehicleWithinScope({ organizationId, userId, scope, vehicle }))) return { error: 'This vehicle is outside your QR Management scope.' }

    return { target: { type: 'vehicle', id: vehicle.id, label: vehicle.vehicle_number + ' · ' + vehicleDisplayName(vehicle) } }
  }

  const { data: form } = await supabase
    .from('forge_form_templates')
    .select('id, title, status, current_version, archived_at')
    .eq('organization_id', organizationId)
    .eq('id', targetId)
    .maybeSingle()

  if (!form) return { error: 'Form was not found.' }

  const published = form.status === 'active' && Number(form.current_version) > 0 && !form.archived_at

  if (!published && !unchanged) return { error: 'Only published forms can have a QR code.' }

  return { target: { type: 'form', id: form.id, label: form.title } }
}

/**
 * Checks every inspection template and form the config points at belongs to this company. Newly chosen ones
 * must also be active / published; ones already saved on this QR may stay even if they were retired since.
 */
const validateActionConfig = async ({
  supabase,
  organizationId,
  config,
  previous
}: {
  supabase: any
  organizationId: string
  config: QrActionConfig
  previous: QrActionConfig | null
}): Promise<{ error: string } | null> => {
  const { inspectionTemplateIds, formTemplateIds } = qrConfigReferences(config)
  const kept = previous ? qrConfigReferences(previous) : { inspectionTemplateIds: [], formTemplateIds: [] }

  if (inspectionTemplateIds.length) {
    const { data, error } = await supabase
      .from('forge_inspection_templates')
      .select('id, is_active')
      .eq('organization_id', organizationId)
      .in('id', inspectionTemplateIds)

    if (error) return { error: 'Unable to check inspection templates.' }

    const byId = new Map<string, any>((data || []).map((row: any) => [row.id, row]))

    for (const frequency of Object.keys(config.inspectionTemplates) as ScanFrequency[]) {
      const id = config.inspectionTemplates[frequency] as string
      const row = byId.get(id)
      const label = SCAN_FREQUENCY_LABELS[frequency].toLowerCase()

      if (!row) return { error: `The ${label} inspection template was not found.` }
      if (!row.is_active && !kept.inspectionTemplateIds.includes(id)) return { error: `The ${label} inspection template is not active.` }
    }
  }

  if (formTemplateIds.length) {
    const { data, error } = await supabase
      .from('forge_form_templates')
      .select('id, status, current_version, archived_at')
      .eq('organization_id', organizationId)
      .in('id', formTemplateIds)

    if (error) return { error: 'Unable to check linked forms.' }

    const byId = new Map<string, any>((data || []).map((row: any) => [row.id, row]))

    for (const id of formTemplateIds) {
      const row = byId.get(id)

      if (!row) return { error: 'A linked form was not found.' }

      const published = row.status === 'active' && Number(row.current_version) > 0 && !row.archived_at

      if (!published && !kept.formTemplateIds.includes(id)) return { error: 'Linked forms must be published.' }
    }
  }

  return null
}

const parseCommon = (values: QrFormValues, statusError: string) => {
  const name = cleanText(values.name)
  const status = cleanText(values.status) || 'active'
  const expiresAt = cleanText(values.expires_at)

  if (!name) return { error: 'QR Name is required.' }
  if (!['active', 'disabled'].includes(status)) return { error: statusError }

  let expirationIso: string | null = null

  if (expiresAt) {
    const parsed = new Date(expiresAt)

    if (Number.isNaN(parsed.getTime())) return { error: 'Expiration date and time is invalid.' }
    expirationIso = parsed.toISOString()
  }

  return { name, status, expirationIso }
}

const parseDefaultAction = (values: QrFormValues, targetType: string) => {
  const defaultAction = cleanText(values.default_action) || 'scan_menu'

  if (!allowedQrDefaultActions(targetType).includes(defaultAction)) {
    return { error: targetType === 'asset' ? 'Invalid QR Default Action.' : 'Location, area, form and vehicle QR codes always open the scan menu.' }
  }

  return { defaultAction }
}

/** Vehicle QRs have no frequency checklists (the DVIR replaces them), so saved templates are dropped. */
const configForTarget = (config: QrActionConfig, targetType: string): QrActionConfig =>
  targetType === 'vehicle' ? { ...config, inspectionTemplates: {} } : config

const parseAccessMode = (value: unknown) =>
  (SCAN_ACCESS_MODES as readonly string[]).includes(value as string) ? parseScanAccessMode(value) : null

export const createManagedQrCode = async (values: QrFormValues, settings?: Partial<QrScanSettings>) => {
  const context = await requireTenantPermission('qr_management.create')
  const organizationId = context.activeOrganization.id
  const targetType = cleanText(settings?.targetType) || 'asset'
  const targetId = targetType === 'asset' ? cleanText(settings?.targetId) || cleanText(values.asset_id) : cleanText(settings?.targetId)

  const validation = await validateForm({ organizationId, values: { ...values, asset_id: targetType === 'asset' ? targetId : values.asset_id ?? null }, targetType })

  if ('error' in validation) return validation

  const common = parseCommon(values, 'New QR codes can only be Active or Disabled.')

  if ('error' in common) return common

  const action = parseDefaultAction(values, targetType)

  if ('error' in action) return action

  const accessMode = settings?.accessMode === undefined ? 'signed_in' : parseAccessMode(settings.accessMode)

  if (!accessMode) return { error: 'Choose who can use this QR code.' }

  const config = configForTarget(parseQrActionConfig(settings?.actionConfig ?? {}), targetType)
  const supabase = createServiceRoleClient() as any

  const target = await validateTarget({
    supabase,
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    targetType,
    targetId
  })

  if ('error' in target) return target

  const configError = await validateActionConfig({ supabase, organizationId, config, previous: null })

  if (configError) return configError

  const { data: qrNumber, error: numberError } = await supabase.rpc('next_forge_qr_number', {
    p_organization_id: organizationId
  })

  if (numberError || !qrNumber) return { error: numberError?.message ?? 'Unable to generate QR number.' }

  const { data: qrCode, error } = await supabase
    .from('forge_qr_codes')
    .insert({
      organization_id: organizationId,
      qr_number: qrNumber,
      name: common.name,
      description: cleanText(values.description),
      status: common.status,
      target_type: target.target.type,
      target_id: target.target.id,
      default_action: action.defaultAction,
      access_mode: accessMode,
      action_config: config,
      expires_at: common.expirationIso,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !qrCode) return { error: error?.message ?? 'Unable to create managed QR code.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'qr.created',
    entityId: qrCode.id,
    after: {
      ...qrCode,
      token: undefined,
      target_label: target.target.label
    }
  })

  if (target.target.type === 'area') {
    await writeAreaActivity({
      organizationId,
      areaId: target.target.id,
      actorUserId: context.user.id,
      type: 'qr_created',
      message: `Area Card QR ${qrCode.qr_number} created.`,
      metadata: { qr_code_id: qrCode.id }
    })
    revalidatePath('/waypoint/' + target.target.id)
  }

  revalidatePath('/qr')

  return { id: qrCode.id, message: 'Managed QR code created.' }
}

export const updateManagedQrCode = async ({
  qrCodeId,
  values,
  settings
}: {
  qrCodeId: string
  values: QrFormValues
  settings?: Partial<QrScanSettings>
}) => {
  const context = await requireTenantPermission('qr_management.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_qr_codes')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', qrCodeId)
    .maybeSingle()

  if (!before) return { error: 'Managed QR code not found.' }
  if (before.status === 'archived') return { error: 'Archived QR codes are read-only.' }

  const allowed = await qrCodeWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    qrCode: before
  })

  if (!allowed) return { error: 'This QR code is outside your edit scope.' }

  const targetType = cleanText(settings?.targetType) || before.target_type

  const targetId = settings?.targetId !== undefined
    ? cleanText(settings.targetId)
    : targetType === 'asset' ? cleanText(values.asset_id) || before.target_id : before.target_id

  const validation = await validateForm({ organizationId, values: { ...values, asset_id: targetType === 'asset' ? targetId : values.asset_id ?? null }, targetType })

  if ('error' in validation) return validation

  const common = parseCommon(values, 'Use Archive QR Code to archive this code.')

  if ('error' in common) return common

  const action = parseDefaultAction(values, targetType)

  if ('error' in action) return action

  const accessMode = settings?.accessMode === undefined ? parseScanAccessMode(before.access_mode) : parseAccessMode(settings.accessMode)

  if (!accessMode) return { error: 'Choose who can use this QR code.' }

  const previousConfig = parseQrActionConfig(before.action_config)
  const config = configForTarget(settings?.actionConfig === undefined ? previousConfig : parseQrActionConfig(settings.actionConfig), targetType)

  const target = await validateTarget({
    supabase,
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    targetType,
    targetId,
    current: before
  })

  if ('error' in target) return target

  const configError = await validateActionConfig({ supabase, organizationId, config, previous: previousConfig })

  if (configError) return configError

  const { data: after, error } = await supabase
    .from('forge_qr_codes')
    .update({
      name: common.name,
      description: cleanText(values.description),
      status: common.status,
      target_type: target.target.type,
      target_id: target.target.id,
      default_action: action.defaultAction,
      access_mode: accessMode,
      action_config: config,
      expires_at: common.expirationIso,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('id', qrCodeId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update managed QR code.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'qr.updated',
    entityId: qrCodeId,
    before: { ...before, token: undefined },
    after: { ...after, token: undefined, changed_fields: changedFields(before, after), target_label: target.target.label }
  })

  revalidatePath('/qr')
  revalidatePath('/qr/' + qrCodeId)

  return { message: 'Managed QR code updated.' }
}

export const archiveManagedQrCode = async ({
  qrCodeId,
  reason
}: {
  qrCodeId: string
  reason?: string
}) => {
  const context = await requireTenantPermission('qr_management.delete')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_qr_codes')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', qrCodeId)
    .maybeSingle()

  if (!before) return { error: 'Managed QR code not found.' }
  if (before.status === 'archived') return { error: 'QR code is already archived.' }

  const allowed = await qrCodeWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    qrCode: before
  })

  if (!allowed) return { error: 'This QR code is outside your archive scope.' }

  const now = new Date().toISOString()

  const { data: after, error } = await supabase
    .from('forge_qr_codes')
    .update({
      status: 'archived',
      archived_at: now,
      archived_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', qrCodeId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to archive managed QR code.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'qr.archived',
    entityId: qrCodeId,
    before: { ...before, token: undefined },
    after: {
      ...after,
      token: undefined,
      archive_reason: cleanText(reason)
    }
  })

  revalidatePath('/qr')
  revalidatePath('/qr/' + qrCodeId)

  return { message: 'QR code archived. Existing printed codes no longer resolve.' }
}

export const rotateManagedQrToken = async (qrCodeId: string) => {
  const context = await requireTenantPermission('qr_management.rotate_token')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_qr_codes')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', qrCodeId)
    .maybeSingle()

  if (!before) return { error: 'Managed QR code not found.' }
  if (before.status === 'archived') return { error: 'Archived QR codes cannot be rotated.' }

  const allowed = await qrCodeWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    qrCode: before
  })

  if (!allowed) return { error: 'This QR code is outside your token-rotation scope.' }

  const nextToken = randomBytes(24).toString('hex')

  const { data: after, error } = await supabase
    .from('forge_qr_codes')
    .update({
      token: nextToken,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', qrCodeId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to rotate QR token.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'qr.token_rotated',
    entityId: qrCodeId,
    before: { token_suffix: String(before.token).slice(-6) },
    after: { token_suffix: String(after.token).slice(-6) }
  })

  revalidatePath('/qr/' + qrCodeId)

  return { message: 'QR token rotated. Reprint this QR code before using it.' }
}
