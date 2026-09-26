import type { Metadata } from 'next'
import ObservationList from './ObservationList'
import type { ObservationListItem } from './ObservationList'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import {
  listObservations,
  resolveObservationReporterDisplay
} from '@/lib/forgeObservations'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Observations' }

const ObservationsPage = async () => {
  const context = await requireTenantPermission('observations.view')
  const organizationId = context.activeOrganization.id

  const canViewReporterIdentity = context.access.effective.some(
    item => item.permissionKey === 'observations.view_reporter_identity' && item.allowed
  )

  const [rows, statusLookup, typeLookup, categoryLookup] = await Promise.all([
    listObservations({
      organizationId,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'observations.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'observations.type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'observations.category' })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'observations.create' && item.allowed
  )

  const records: ObservationListItem[] = await Promise.all(
    rows.map(async (record: any) => {
      const reporter = await resolveObservationReporterDisplay({
        organizationId,
        observation: record,
        canViewReporterIdentity
      })

      return {
        id: record.id,
        observation_number: record.observation_number,
        title: record.title,
        status: record.status,
        observation_type: record.observation_type,
        category_key: record.category_key,
        reporting_mode: record.reporting_mode,
        reporterLabel: reporter.label,
        initial_risk_band_key: record.initial_risk_band_key,
        initial_risk_score: record.initial_risk_score,
        assigneeName: record.forge_personnel
          ? [record.forge_personnel.first_name, record.forge_personnel.last_name]
              .filter(Boolean)
              .join(' ')
          : null,
        locationName: record.locations?.name || null,
        occurred_at: record.occurred_at
      }
    })
  )

  return (
    <ObservationList
      records={records}
      canCreate={canCreate}
      statusLabels={Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))}
      typeLabels={Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))}
      categoryLabels={Object.fromEntries(
        categoryLookup.options.map(option => [option.key, option.label])
      )}
    />
  )
}

export default ObservationsPage
