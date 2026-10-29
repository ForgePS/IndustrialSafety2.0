import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import JsaList from './JsaList'
import type { JsaListItem } from './JsaList'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { listJsas } from '@/lib/forgeJsa'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'JSA / JHA' }

const JsasPage = async () => {
  const context = await requireTenantPermission('jsa_jha.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [rows, statusLookup, { data: locations }, { data: divisions }] = await Promise.all([
    listJsas({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'jsa_jha.status' }),
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
    item => item.permissionKey === 'jsa_jha.create' && item.allowed
  )

  const records: JsaListItem[] = rows.map((record: any) => ({
    id: record.id,
    jsa_number: record.jsa_number,
    title: record.title,
    status: record.status,
    version: record.version,
    job_title: record.job_title,
    task_name: record.task_name,
    preparedName: record.forge_personnel
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
    <JsaList
      records={records}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
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

export default JsasPage
