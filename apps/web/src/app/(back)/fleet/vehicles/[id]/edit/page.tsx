import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import VehicleForm from '@/components/fleet/VehicleForm'
import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import { vehicleDisplayName } from '@/lib/forgeFleetRules'
import { allowedKeys, loadDriverCandidates, loadLocationsAndDivisions, loadVehicleInScope } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit Vehicle' }

const EditVehiclePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('fleet.edit')
  const vehicle = await loadVehicleInScope({ context, vehicleId: id })

  if (!vehicle) notFound()

  const organizationId = context.activeOrganization.id
  const [drivers, places] = await Promise.all([loadDriverCandidates(organizationId), loadLocationsAndDivisions(organizationId)])

  // Keep a deactivated location / division selectable on the record that already uses it.
  const locations = places.locations.filter(location => location.active || location.id === vehicle.location_id)
  const divisions = places.divisions.filter(division => division.active || division.id === vehicle.division_id)

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader active='vehicles' permissions={allowedKeys(context)} title={'Edit ' + vehicleDisplayName(vehicle)} subtitle={vehicle.vehicle_number} />
      <VehicleForm vehicle={vehicle} drivers={drivers} locations={locations} divisions={divisions} />
    </div>
  )
}

export default EditVehiclePage
