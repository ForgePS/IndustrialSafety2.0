import type { Metadata } from 'next'

import { createServiceRoleClient } from '@repo/supabase/server'

import LotoList from './LotoList'
import type { LotoListItem } from './LotoList'
import LotoTabs from './LotoTabs'
import { getScopedLotoProcedures } from '@/lib/forgeLoto'
import { isOpenLockout } from '@/lib/forgeLotoRules'
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

  const ids = records.map((record: any) => record.id)

  const { data: open } = ids.length
    ? await (createServiceRoleClient() as any)
        .from('forge_loto_applications')
        .select('procedure_id, status')
        .eq('organization_id', organizationId)
        .in('procedure_id', ids)
        .in('status', ['in_progress', 'verified'])
    : { data: [] }

  const lockedOut = new Set((open || []).filter((row: any) => isOpenLockout(row.status)).map((row: any) => row.procedure_id))
  const allowed = (key: string) => context.access.effective.some(item => item.permissionKey === key && item.allowed)

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
    divisionName: record.forge_assets?.divisions?.name || null,
    lockedOut: lockedOut.has(record.id)
  }))

  return (
    <LotoList
      procedures={procedures}
      canCreate={allowed('loto.create')}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      tabs={<LotoTabs active='procedures' showSettings={allowed('loto.settings')} />}
    />
  )
}

export default LotoPage
