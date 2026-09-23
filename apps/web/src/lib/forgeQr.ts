import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { assetWithinScope, getScopedAssets } from '@/lib/forgeAssets'

export const getForgeQrBaseUrl = () => {
  const value =
    process.env.QR_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  return value.replace(/\/+$/, '')
}

export const getForgeQrScanUrl = (token: string) =>
  getForgeQrBaseUrl() + '/q/' + encodeURIComponent(token)

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

  let allowedAssetIds: string[] | null = null

  if (permission.scope !== 'organization') {
    const assets = await getScopedAssets({
      organizationId,
      userId,
      permission,
      includeRetired: true
    })

    allowedAssetIds = assets.map((asset: any) => asset.id)
    if (!allowedAssetIds.length) return []
  }

  let query = supabase
    .from('forge_qr_codes')
    .select('*')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('name')

  if (allowedAssetIds) {
    query = query.eq('target_type', 'asset').in('target_id', allowedAssetIds)
  }

  const { data, error } = await query
  if (error) throw new Error('Unable to load managed QR codes: ' + error.message)

  const rows = data || []
  const assetIds = Array.from(
    new Set(
      rows
        .filter((row: any) => row.target_type === 'asset')
        .map((row: any) => row.target_id)
    )
  )

  const assetById = new Map<string, any>()

  if (assetIds.length) {
    const { data: assets, error: assetsError } = await supabase
      .from('forge_assets')
      .select('id, asset_number, name, status, location_id, division_id')
      .eq('organization_id', organizationId)
      .in('id', assetIds)

    if (assetsError) throw new Error('Unable to load QR asset targets: ' + assetsError.message)
    for (const asset of assets || []) assetById.set(asset.id, asset)
  }

  return rows.map((row: any) => ({
    ...row,
    targetAsset: row.target_type === 'asset' ? assetById.get(row.target_id) || null : null
  }))
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
