import type { Metadata } from 'next'
import InspectionList from './InspectionList'
import type { InspectionListItem } from './InspectionList'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'Inspections' }

const InspectionsPage = async () => {
  const context = await requireTenantPermission('inspections.view')
  const organizationId = context.activeOrganization.id

  const [records, statusLookup, resultLookup, typeLookup] = await Promise.all([
    getScopedInspections({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.result' }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.type' })
  ])

  const has = (key: string) =>
    context.access.effective.some(item => item.permissionKey === key && item.allowed)

  const inspections: InspectionListItem[] = records.map((record: any) => ({
    id: record.id,
    inspection_number: record.inspection_number,
    status: record.status,
    result: record.result,
    inspection_date: record.inspection_date,
    templateName: record.template_name_snapshot || record.forge_inspection_templates?.name || null,
    inspectionType: record.forge_inspection_templates?.inspection_type || null,
    locationName: record.locations?.name || null,
    divisionName: record.divisions?.name || null
  }))

  return (
    <InspectionList
      inspections={inspections}
      canCreate={has('inspections.create')}
      canManageTemplates={has('inspections.manage_templates')}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      resultLabels={Object.fromEntries(resultLookup.options.map(option => [option.key, option.label]))}
      typeLabels={Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default InspectionsPage
