import type { Metadata } from 'next'

import { createServiceRoleClient } from '@repo/supabase/server'

import LotoList from './LotoList'
import type { LotoListItem } from './LotoList'
import LotoTabs from './LotoTabs'
import { getScopedLotoProcedures } from '@/lib/forgeLoto'
import { distinctOptions, filterLotoRows, lotoListStats, paginate, parseLotoListParams, sortLotoRows } from '@/lib/forgeLotoList'
import { isOpenLockout } from '@/lib/forgeLotoRules'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Lockout / Tagout' }

const LotoPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('loto.view')
  const organizationId = context.activeOrganization.id
  const params = parseLotoListParams(await searchParams)

  // Retired procedures are loaded too so they can be shown on request; the default view hides them.
  const [records, statusLookup] = await Promise.all([
    getScopedLotoProcedures({
      organizationId,
      userId: context.user.id,
      permission: context.permission,
      includeRetired: true
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

  const openRows = (open || []).filter((row: any) => isOpenLockout(row.status))
  const lockedOut = new Set(openRows.map((row: any) => row.procedure_id))
  const allowed = (key: string) => context.access.effective.some(item => item.permissionKey === key && item.allowed)

  const procedures: LotoListItem[] = records.map((record: any) => ({
    id: record.id,
    procedure_number: record.procedure_number,
    title: record.title,
    status: record.status,
    revision_number: Number(record.revision_number || 1),
    next_review_date: record.next_review_date,
    effective_date: record.effective_date,
    updated_at: record.updated_at || null,
    assetName: record.forge_assets?.name || null,
    assetNumber: record.forge_assets?.asset_number || null,
    locationId: record.forge_assets?.location_id || null,
    locationName: record.forge_assets?.locations?.name || null,
    divisionId: record.forge_assets?.division_id || null,
    divisionName: record.forge_assets?.divisions?.name || null,
    lockedOut: lockedOut.has(record.id)
  }))

  const current = procedures.filter(item => item.status !== 'retired')
  const filtered = sortLotoRows(filterLotoRows(procedures, params), params.sort, params.dir)
  const paged = paginate(filtered, params.page, params.size)

  return (
    <LotoList
      procedures={paged.rows}
      paging={{ page: paged.page, pageCount: paged.pageCount, total: paged.total, from: paged.from, to: paged.to }}
      params={{ ...params, page: paged.page }}
      stats={lotoListStats(procedures, openRows.length)}
      locationOptions={distinctOptions(current.map(item => ({ id: item.locationId, name: item.locationName })))}
      divisionOptions={distinctOptions(current.map(item => ({ id: item.divisionId, name: item.divisionName })))}
      canCreate={allowed('loto.create')}
      canRetire={allowed('loto.retire')}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      tabs={<LotoTabs active='procedures' showSettings={allowed('loto.settings')} />}
    />
  )
}

export default LotoPage
