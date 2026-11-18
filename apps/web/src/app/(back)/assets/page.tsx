import type { Metadata } from 'next'
import AssetList from './AssetList'
import type { AssetListItem } from './AssetList'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedAssets } from '@/lib/forgeAssets'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'Assets & Equipment' }

const AssetsPage = async () => {
  const context = await requireTenantPermission('assets_equipment.view')
  const organizationId = context.activeOrganization.id

  const [records, typeLookup, statusLookup, conditionLookup, criticalityLookup] = await Promise.all([
    getScopedAssets({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.condition' }),
    getEffectiveLookup({ organizationId, lookupKey: 'assets.criticality' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'assets_equipment.create' && item.allowed
  )

  const assets: AssetListItem[] = records.map((record: any) => ({
    id: record.id,
    asset_number: record.asset_number,
    name: record.name,
    asset_type: record.asset_type,
    status: record.status,
    condition: record.condition,
    criticality: record.criticality,
    manufacturer: record.manufacturer,
    model: record.model,
    serial_number: record.serial_number,
    locationName: record.locations?.name || null,
    divisionName: record.divisions?.name || null,
    custodianName: record.forge_personnel
      ? record.forge_personnel.first_name + ' ' + record.forge_personnel.last_name
      : null
  }))

  return (
    <AssetList
      assets={assets}
      canCreate={canCreate}
      typeLabels={Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      conditionLabels={Object.fromEntries(conditionLookup.options.map(option => [option.key, option.label]))}
      criticalityLabels={Object.fromEntries(criticalityLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default AssetsPage
