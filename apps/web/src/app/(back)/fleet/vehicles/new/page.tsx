import type { Metadata } from 'next'

import VehicleForm from '@/components/fleet/VehicleForm'
import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import { allowedKeys, loadDriverCandidates, loadLocationsAndDivisions } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New Vehicle' }

const NewVehiclePage = async () => {
  const context = await requireTenantPermission('fleet.create')
  const organizationId = context.activeOrganization.id
  const [drivers, places] = await Promise.all([loadDriverCandidates(organizationId), loadLocationsAndDivisions(organizationId)])

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader active='vehicles' permissions={allowedKeys(context)} title='New vehicle' subtitle='The vehicle number is assigned when you save.' />
      <VehicleForm vehicle={null} drivers={drivers} locations={places.locations.filter(location => location.active)} divisions={places.divisions.filter(division => division.active)} />
    </div>
  )
}

export default NewVehiclePage
