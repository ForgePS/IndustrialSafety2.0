import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { assetWithinScope, getScopedAssets } from '@/lib/forgeAssets'
import { scopedVehicleIds, vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { vehicleDisplayName } from '@/lib/forgeFleetRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export const getForgeQrBaseUrl = () => {
  const value =
    process.env.QR_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  return value.replace(/\/+$/, '')
}

export const getForgeQrScanUrl = (token: string) =>
  getForgeQrBaseUrl() + '/q/' + encodeURIComponent(token)

/** Location ids the user may manage QR codes for, or null for every location in the company. */
export const getScopedLocationIds = async ({
  organizationId,
  userId,
  scope
}: {
  organizationId: string
  userId: string
  scope: string | null
}): Promise<string[] | null> => {
  if (scope === 'organization') return null
  if (scope !== 'location' && scope !== 'division') return []

  const { locationIds, divisionIds } = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') return locationIds
  if (!divisionIds.length) return []

  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('locations')
    .select('id')
    .eq('organization_id', organizationId)
    .in('division_id', divisionIds)

  return (data || []).map((row: any) => row.id)
}

export const locationWithinScope = async ({
  organizationId,
  userId,
  scope,
  locationId
}: {
  organizationId: string
  userId: string
  scope: string | null
  locationId: string
}) => {
  const allowed = await getScopedLocationIds({ organizationId, userId, scope })

  return allowed === null || allowed.includes(locationId)
}

/**
 * Whether a QR is inside the user's data scope. Asset QRs follow the asset's scope; vehicle QRs the vehicle's
 * fleet scope (vehicleWithinScope); location QRs follow the user's location (or division) assignments; form
 * QRs are company-wide, like the form library.
 */
export const qrCodeWithinScope = async ({
  organizationId,
  userId,
  scope,
  qrCode
}: {
  organizationId: string
  userId: string
  scope: string | null
  qrCode: {
    organization_id: string
    target_type: string
    target_id: string
  }
}) => {
  if (qrCode.organization_id !== organizationId) return false

  if (scope === 'organization') return true
  if (!scope) return false
  if (qrCode.target_type === 'form') return true

  if (qrCode.target_type === 'location') {
    return locationWithinScope({ organizationId, userId, scope, locationId: qrCode.target_id })
  }

  if (qrCode.target_type === 'vehicle') {
    const { data: vehicle } = await (createServiceRoleClient() as any)
      .from('forge_fleet_vehicles')
      .select('organization_id, location_id, division_id, assigned_driver_personnel_id')
      .eq('organization_id', organizationId)
      .eq('id', qrCode.target_id)
      .maybeSingle()

    return Boolean(vehicle) && vehicleWithinScope({ organizationId, userId, scope, vehicle })
  }

  if (qrCode.target_type !== 'asset') return false

  const supabase = createServiceRoleClient() as any

  const { data: asset } = await supabase
    .from('forge_assets')
    .select('organization_id, custodian_user_id, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('id', qrCode.target_id)
    .maybeSingle()

  if (!asset) return false

  return assetWithinScope({
    organizationId,
    userId,
    scope,
    asset
  })
}

export const getScopedQrCodes = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const supabase = createServiceRoleClient() as any

  let allowedAssetIds: Set<string> | null = null
  let allowedLocationIds: Set<string> | null = null
  let allowedVehicleIds: Set<string> | null = null

  if (permission.scope !== 'organization') {
    const [assets, locationIds, vehicleIds] = await Promise.all([
      getScopedAssets({
        organizationId,
        userId,
        permission,
        includeRetired: true
      }),
      getScopedLocationIds({ organizationId, userId, scope: permission.scope }),
      scopedVehicleIds({ organizationId, userId, scope: permission.scope })
    ])

    allowedAssetIds = new Set(assets.map((asset: any) => asset.id))
    allowedLocationIds = new Set(locationIds || [])
    allowedVehicleIds = new Set(vehicleIds || [])
  }

  const { data, error } = await supabase
    .from('forge_qr_codes')
    .select('*')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('name')

  if (error) throw new Error('Unable to load managed QR codes: ' + error.message)

  const rows = (data || []).filter((row: any) => {
    if (!allowedAssetIds || !allowedLocationIds || !allowedVehicleIds) return true
    if (row.target_type === 'asset') return allowedAssetIds.has(row.target_id)
    if (row.target_type === 'vehicle') return allowedVehicleIds.has(row.target_id)
    if (row.target_type === 'location') return allowedLocationIds.has(row.target_id)
    if (row.target_type === 'form') return Boolean(permission.scope)

    return false
  })

  const idsOf = (type: string): string[] =>
    Array.from(new Set(rows.filter((row: any) => row.target_type === type).map((row: any) => row.target_id as string)))

  const assetIds = idsOf('asset')
  const locationIds = idsOf('location')
  const formIds = idsOf('form')
  const vehicleIds = idsOf('vehicle')
  const empty = Promise.resolve({ data: [], error: null })

  const [assetsResult, locationsResult, formsResult, vehiclesResult] = await Promise.all([
    assetIds.length
      ? supabase.from('forge_assets').select('id, asset_number, name, status, location_id, division_id').eq('organization_id', organizationId).in('id', assetIds)
      : empty,
    locationIds.length
      ? supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).in('id', locationIds)
      : empty,
    formIds.length
      ? supabase.from('forge_form_templates').select('id, title, status').eq('organization_id', organizationId).in('id', formIds)
      : empty,
    vehicleIds.length
      ? supabase
          .from('forge_fleet_vehicles')
          .select('id, vehicle_number, unit_number, year, make, model, status')
          .eq('organization_id', organizationId)
          .in('id', vehicleIds)
      : empty
  ])

  if (assetsResult.error) throw new Error('Unable to load QR asset targets: ' + assetsResult.error.message)
  if (locationsResult.error) throw new Error('Unable to load QR location targets: ' + locationsResult.error.message)
  if (formsResult.error) throw new Error('Unable to load QR form targets: ' + formsResult.error.message)
  if (vehiclesResult.error) throw new Error('Unable to load QR vehicle targets: ' + vehiclesResult.error.message)

  const assetById = new Map<string, any>((assetsResult.data || []).map((item: any) => [item.id, item]))
  const locationById = new Map<string, any>((locationsResult.data || []).map((item: any) => [item.id, item]))
  const formById = new Map<string, any>((formsResult.data || []).map((item: any) => [item.id, item]))
  const vehicleById = new Map<string, any>((vehiclesResult.data || []).map((item: any) => [item.id, item]))

  return rows.map((row: any) => {
    const targetAsset = row.target_type === 'asset' ? assetById.get(row.target_id) || null : null
    const targetLocation = row.target_type === 'location' ? locationById.get(row.target_id) || null : null
    const targetForm = row.target_type === 'form' ? formById.get(row.target_id) || null : null
    const targetVehicle = row.target_type === 'vehicle' ? vehicleById.get(row.target_id) || null : null

    return {
      ...row,
      targetAsset,
      targetLocation,
      targetForm,
      targetVehicle,
      targetName: (targetAsset?.name || targetLocation?.name || targetForm?.title || (targetVehicle ? vehicleDisplayName(targetVehicle) : null) || null) as string | null,
      targetDetail: (targetAsset?.asset_number || targetLocation?.code || targetVehicle?.vehicle_number || null) as string | null
    }
  })
}

export type QrTarget = {
  type: 'asset' | 'location' | 'form' | 'vehicle'
  id: string
  name: string
  detail: string | null
  href: string | null
  asset: any | null
}

/** The QR's target with a display name (asset, location, form template or fleet vehicle). */
export const getQrTarget = async ({
  organizationId,
  targetType,
  targetId
}: {
  organizationId: string
  targetType: string
  targetId: string
}): Promise<QrTarget | null> => {
  const supabase = createServiceRoleClient() as any

  if (targetType === 'asset') {
    const { data } = await supabase
      .from('forge_assets')
      .select('id, asset_number, name, status, retired_at, location_id')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    return data ? { type: 'asset', id: data.id, name: data.name, detail: data.asset_number, href: '/assets/' + data.id, asset: data } : null
  }

  if (targetType === 'location') {
    const { data } = await supabase
      .from('locations')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    return data ? { type: 'location', id: data.id, name: data.name, detail: data.code || null, href: null, asset: null } : null
  }

  if (targetType === 'vehicle') {
    const { data } = await supabase
      .from('forge_fleet_vehicles')
      .select('id, vehicle_number, unit_number, year, make, model, status, archived_at')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    return data
      ? { type: 'vehicle', id: data.id, name: vehicleDisplayName(data), detail: data.vehicle_number, href: '/fleet/vehicles/' + data.id, asset: null }
      : null
  }

  if (targetType === 'form') {
    const { data } = await supabase
      .from('forge_form_templates')
      .select('id, title, status')
      .eq('organization_id', organizationId)
      .eq('id', targetId)
      .maybeSingle()

    return data
      ? { type: 'form', id: data.id, name: data.title, detail: data.status === 'active' ? 'Published form' : 'Form (' + data.status + ')', href: '/forms/templates/' + data.id, asset: null }
      : null
  }

  return null
}

/**
 * Active inspection templates and published forms of the company, for the QR action configuration
 * pickers (and the form target picker).
 */
export const getQrConfigOptions = async (organizationId: string) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: templates, error: templatesError }, { data: forms, error: formsError }] = await Promise.all([
    supabase
      .from('forge_inspection_templates')
      .select('id, name, inspection_type')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('forge_form_templates')
      .select('id, title, category')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .gt('current_version', 0)
      .is('archived_at', null)
      .order('title')
  ])

  if (templatesError) throw new Error('Unable to load inspection templates: ' + templatesError.message)
  if (formsError) throw new Error('Unable to load forms: ' + formsError.message)

  return {
    inspectionTemplates: (templates || []).map((item: any) => ({ id: item.id as string, label: item.name as string })),
    forms: (forms || []).map((item: any) => ({ id: item.id as string, label: (item.category ? item.title + ' · ' + item.category : item.title) as string }))
  }
}

export const getQrScanHistory = async ({
  organizationId,
  qrCodeId,
  limit = 100
}: {
  organizationId: string
  qrCodeId: string
  limit?: number
}) => {
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_qr_scans')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('qr_code_id', qrCodeId)
    .order('scanned_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500))

  if (error) throw new Error('Unable to load QR scan history: ' + error.message)

  return data || []
}

/** Scan-log rows of the last N days (for the summary on the QR detail page). */
export const getQrScanEventsSince = async ({
  organizationId,
  qrCodeId,
  days = 30
}: {
  organizationId: string
  qrCodeId: string
  days?: number
}) => {
  const supabase = createServiceRoleClient() as any
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('forge_qr_scans')
    .select('action, result, destination_path, scanned_at')
    .eq('organization_id', organizationId)
    .eq('qr_code_id', qrCodeId)
    .gte('scanned_at', since)
    .limit(10000)

  if (error) throw new Error('Unable to load QR scan summary: ' + error.message)

  return data || []
}
