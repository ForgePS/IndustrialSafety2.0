import type { Metadata } from 'next'
import PersonnelList from './PersonnelList'
import type { PersonnelListItem } from './PersonnelList'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export const metadata: Metadata = { title: 'Personnel' }

const PersonnelPage = async () => {
  const context = await requireTenantPermission('personnel.view')

  const [records, statusLookup] = await Promise.all([
    getScopedPersonnel({
      organizationId: context.activeOrganization.id,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveLookup({
      organizationId: context.activeOrganization.id,
      lookupKey: 'personnel.employment_status'
    })
  ])

  const canCreate = context.access.effective.some(
    item => item.permissionKey === 'personnel.create' && item.allowed
  )

  const statusLabels = Object.fromEntries(
    statusLookup.options.map(option => [option.key, option.label])
  )

  const personnel: PersonnelListItem[] = records.map((record: any) => ({
    id: record.id,
    first_name: record.first_name,
    last_name: record.last_name,
    employee_number: record.employee_number,
    employment_status: record.employment_status,
    job_title: record.job_title,
    email: record.email,
    locationName: record.locations?.name || null,
    divisionName: record.divisions?.name || null
  }))

  return (
    <PersonnelList
      personnel={personnel}
      canCreate={canCreate}
      statusLabels={statusLabels}
    />
  )
}

export default PersonnelPage
