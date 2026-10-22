'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { assetWithinScope } from '@/lib/forgeAssets'
import { getEffectiveForm } from '@/lib/forgeForms'
import { qrCodeWithinScope } from '@/lib/forgeQr'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type QrFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const validateForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: QrFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey: 'qr.profile' })
  if (!form) return { error: 'Managed QR Code form is not configured.' }

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

const loadTargetAsset = async ({
  supabase,
  organizationId,
  assetId
}: {
  supabase: any
  organizationId: string
  assetId: string
}) => {
  const { data } = await supabase
    .from('forge_assets')
    .select('id, organization_id, name, asset_number, custodian_user_id, location_id, division_id, retired_at')
    .eq('organization_id', organizationId)
    .eq('id', assetId)
    .maybeSingle()

  return data
}

const validateAssetTarget = async ({
  supabase,
  organizationId,
  userId,
  scope,
  assetId
}: {
  supabase: any
  organizationId: string
  userId: string
  scope: string | null
  assetId: string
}) => {
  const asset = await loadTargetAsset({ supabase, organizationId, assetId })
  if (!asset) return { error: 'Linked Asset was not found.' }

  const allowed = await assetWithinScope({
    organizationId,
    userId,
    scope,
    asset
  })

  if (!allowed) return { error: 'Linked Asset is outside your QR Management scope.' }
  return { asset }
}

export const createManagedQrCode = async (values: QrFormValues) => {
  const context = await requireTenantPermission('qr_management.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, values })
  if ('error' in validation) return validation

  const name = cleanText(values.name)
  const assetId = cleanText(values.asset_id)
  const defaultAction = cleanText(values.default_action) || 'asset_record'
  const status = cleanText(values.status) || 'active'
  const expiresAt = cleanText(values.expires_at)

  if (!name || !assetId) return { error: 'QR Name and Linked Asset are required.' }
  if (!['asset_record','maintenance','meter_reading'].includes(defaultAction)) {
    return { error: 'Invalid QR Default Action.' }
  }
  if (!['active','disabled'].includes(status)) {
    return { error: 'New QR codes can only be Active or Disabled.' }
  }

  let expirationIso: string | null = null
  if (expiresAt) {
    const parsed = new Date(expiresAt)
    if (Number.isNaN(parsed.getTime())) return { error: 'Expiration date and time is invalid.' }
    expirationIso = parsed.toISOString()
  }

  const supabase = createServiceRoleClient() as any
  const target = await validateAssetTarget({
    supabase,
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    assetId
  })
  if ('error' in target) return target

  const { data: qrNumber, error: numberError } = await supabase.rpc('next_forge_qr_number', {
    p_organization_id: organizationId
  })
  if (numberError || !qrNumber) return { error: numberError?.message ?? 'Unable to generate QR number.' }

  const { data: qrCode, error } = await supabase
    .from('forge_qr_codes')
    .insert({
      organization_id: organizationId,
      qr_number: qrNumber,
      name,
      description: cleanText(values.description),
      status,
      target_type: 'asset',
      target_id: assetId,
      default_action: defaultAction,
      expires_at: expirationIso,
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
      target_asset_number: target.asset.asset_number
    }
  })

  revalidatePath('/qr')
  return { id: qrCode.id, message: 'Managed QR code created.' }
}

export const updateManagedQrCode = async ({
  qrCodeId,
  values
}: {
  qrCodeId: string
  values: QrFormValues
}) => {
  const context = await requireTenantPermission('qr_management.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateForm({ organizationId, values })
  if ('error' in validation) return validation

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

  const name = cleanText(values.name)
  const assetId = cleanText(values.asset_id)
  const defaultAction = cleanText(values.default_action) || 'asset_record'
  const status = cleanText(values.status) || 'active'
  const expiresAt = cleanText(values.expires_at)

  if (!name || !assetId) return { error: 'QR Name and Linked Asset are required.' }
  if (!['asset_record','maintenance','meter_reading'].includes(defaultAction)) {
    return { error: 'Invalid QR Default Action.' }
  }
  if (!['active','disabled'].includes(status)) {
    return { error: 'Use Archive QR Code to archive this code.' }
  }

  let expirationIso: string | null = null
  if (expiresAt) {
    const parsed = new Date(expiresAt)
    if (Number.isNaN(parsed.getTime())) return { error: 'Expiration date and time is invalid.' }
    expirationIso = parsed.toISOString()
  }

  const target = await validateAssetTarget({
    supabase,
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    assetId
  })
  if ('error' in target) return target

  const { data: after, error } = await supabase
    .from('forge_qr_codes')
    .update({
      name,
      description: cleanText(values.description),
      status,
      target_type: 'asset',
      target_id: assetId,
      default_action: defaultAction,
      expires_at: expirationIso,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
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
    after: { ...after, token: undefined }
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
