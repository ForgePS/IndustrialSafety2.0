import type { Metadata } from 'next'
import LotoList from './LotoList'
import type { LotoListItem } from './LotoList'
import { getScopedLotoProcedures } from '@/lib/forgeLoto'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Lockout / Tagout' }

const LotoPage = async () => {
  const context = await requireTenantPermission('loto.view')
  const organizationId = context.activeOrganization.id

  const [records, statusLookup] = await Promise.all([
    getScopedLotoProcedures({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'loto.status' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'loto.create' && item.allowed
  )

  const procedures: LotoListItem[] = records.map((record: any) => ({
    id: record.id,
    procedure_number: record.procedure_number,
    title: record.title,
    status: record.status,
    revision_number: Number(record.revision_number || 1),
    next_review_date: record.next_review_date,
    effective_date: record.effective_date,
    assetName: record.forge_assets?.name || null,
    assetNumber: record.forge_assets?.asset_number || null,
    locationName: record.forge_assets?.locations?.name || null,
    divisionName: record.forge_assets?.divisions?.name || null
  }))

  return (
    <LotoList
      procedures={procedures}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default LotoPage
