import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import RiskList from './RiskList'
import type { RiskListItem } from './RiskList'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { listRisks } from '@/lib/forgeRiskRegister'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Risk Register' }

const RiskRegisterPage = async () => {
  const context = await requireTenantPermission('risk_register.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [rows, statusLookup, categoryLookup, { data: locations }, { data: divisions }] =
    await Promise.all([
      listRisks({
        organizationId,
        userId: context.user.id,
        permission: context.permission
      }),
      getEffectiveLookup({ organizationId, lookupKey: 'risk_register.status' }),
      getEffectiveLookup({ organizationId, lookupKey: 'risk_register.category' }),
      supabase
        .from('locations')
        .select('id, name, code')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('divisions')
        .select('id, name, code')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name')
    ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'risk_register.create' && item.allowed
  )

  const records: RiskListItem[] = rows.map((record: any) => ({
    id: record.id,
    risk_number: record.risk_number,
    title: record.title,
    status: record.status,
    category_key: record.category_key,
    inherent_band_key: record.inherent_band_key,
    inherent_score: record.inherent_score,
    residual_band_key: record.residual_band_key,
    residual_score: record.residual_score,
    ownerName: record.forge_personnel
      ? [record.forge_personnel.first_name, record.forge_personnel.last_name]
          .filter(Boolean)
          .join(' ')
      : null,
    location_id: record.location_id,
    locationName: record.locations?.name || null,
    division_id: record.division_id,
    divisionName: record.divisions?.name || null,
    updated_at: record.updated_at
  }))

  return (
    <RiskList
      records={records}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      categoryLabels={Object.fromEntries(
        categoryLookup.options.map(option => [option.key, option.label])
      )}
      locations={(locations || []).map((item: any) => ({
        id: item.id,
        label: item.code ? item.name + ' (' + item.code + ')' : item.name
      }))}
      divisions={(divisions || []).map((item: any) => ({
        id: item.id,
        label: item.code ? item.name + ' (' + item.code + ')' : item.name
      }))}
    />
  )
}

export default RiskRegisterPage
