import type { Metadata } from 'next'
import IncidentList from './IncidentList'
import type { IncidentListItem } from './IncidentList'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'Incidents' }

const IncidentsPage = async () => {
  const context = await requireTenantPermission('incidents.view')
  const organizationId = context.activeOrganization.id

  const [records, statusLookup, typeLookup, severityLookup] = await Promise.all([
    getScopedIncidents({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'incidents.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'incidents.type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'incidents.severity' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'incidents.create' && item.allowed
  )

  const incidents: IncidentListItem[] = records.map((record: any) => ({
    id: record.id,
    incident_number: record.incident_number,
    status: record.status,
    incident_type: record.incident_type,
    severity: record.severity,
    occurred_at: record.occurred_at,
    summary: record.summary,
    locationName: record.locations?.name || null,
    divisionName: record.divisions?.name || null
  }))

  return (
    <IncidentList
      incidents={incidents}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      typeLabels={Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))}
      severityLabels={Object.fromEntries(severityLookup.options.map(option => [option.key, option.label]))}
    />
  )
}

export default IncidentsPage
