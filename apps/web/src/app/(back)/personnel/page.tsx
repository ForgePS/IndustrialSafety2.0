import type { Metadata } from 'next'

import PersonnelList from './PersonnelList'
import type { PersonnelListItem } from './PersonnelList'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'Personnel' }

type PersonnelSearchParams = { view?: string; q?: string; status?: string; location?: string; sort?: string }

const PersonnelPage = async ({ searchParams }: { searchParams: Promise<PersonnelSearchParams> }) => {
  const context = await requireTenantPermission('personnel.view')
  const params = await searchParams
  const view = params.view === 'archived' ? 'archived' : 'active'

  const [allRecords, statusLookup] = await Promise.all([
    getScopedPersonnel({
      organizationId: context.activeOrganization.id,
      userId: context.user.id,
      permission: context.permission,
      includeArchived: view === 'archived'
    }),
    getEffectiveLookup({
      organizationId: context.activeOrganization.id,
      lookupKey: 'personnel.employment_status'
    })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'personnel.create' && item.allowed
  )

  const canConfigure = context.access.effective.some(
    item => item.permissionKey === 'personnel.configure' && item.allowed
  )

  const statusLabels = Object.fromEntries(
    statusLookup.options.map(option => [option.key, option.label])
  )

  // The archived view lists only archived people; the default roster lists only active (non-archived) ones.
  const records = view === 'archived' ? allRecords.filter((record: any) => record.archived_at) : allRecords

  const personnel: PersonnelListItem[] = records.map((record: any) => ({
    id: record.id,
    first_name: record.first_name,
    last_name: record.last_name,
    employee_number: record.employee_number,
    employment_status: record.employment_status,
    job_title: record.position?.name || record.job_title,
    jobTitleText: record.job_title || null,
    positionName: record.position?.name || null,
    email: record.email,
    locationId: record.location_id || null,
    locationName: record.locations?.name || null,
    divisionName: record.divisions?.name || null,
    departmentName: record.department?.name || null,
    isDotDriver: Boolean(record.is_dot_driver),
    isCompanyDriver: Boolean(record.is_company_driver),
    archivedAt: record.archived_at || null
  }))

  return (
    <PersonnelList
      personnel={personnel}
      canCreate={canCreate}
      canConfigure={canConfigure}
      statusLabels={statusLabels}
      view={view}
      initialFilters={{
        q: params.q || '',
        status: params.status || 'all',
        location: params.location || 'all',
        sort: params.sort === 'first' ? 'first' : 'last'
      }}
    />
  )
}

export default PersonnelPage
