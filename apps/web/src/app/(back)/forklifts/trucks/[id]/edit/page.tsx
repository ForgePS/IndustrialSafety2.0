import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import TruckForm from '@/components/forklifts/TruckForm'
import { companyLocations, covers, forkliftRights, loadTruck, rightsAt } from '@/lib/forgeForkliftAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit forklift' }

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** Port slice 19: edit a forklift's profile and its equipment record. */
const EditTruckPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const truck = await loadTruck(organizationId, rights, id)

  if (!truck) notFound()
  if (!rightsAt(rights, truck.asset.location_id).manage || truck.asset.retired_at) redirect('/forklifts/trucks/' + truck.id)

  const locations = (await companyLocations(organizationId)).filter(location => covers(rights.manage, location.id))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={'/forklifts/trucks/' + truck.id} className='text-primary text-sm hover:underline'>
          ← {truck.asset.name}
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Edit {truck.asset.name}</h1>
      </div>
      <TruckForm
        mode='edit'
        forkliftId={truck.id}
        locations={locations}
        initial={{
          asset_id: truck.asset_id,
          name: truck.asset.name,
          location_id: str(truck.asset.location_id),
          manufacturer: str(truck.asset.manufacturer),
          model: str(truck.asset.model),
          serial_number: str(truck.asset.serial_number),
          truck_class: truck.truck_class,
          truck_type: truck.truck_type,
          power_source: truck.power_source,
          rated_capacity_lb: str(truck.rated_capacity_lb),
          load_center_in: str(truck.load_center_in === null ? null : Number(truck.load_center_in)),
          max_lift_height_in: str(truck.max_lift_height_in === null ? null : Number(truck.max_lift_height_in)),
          attachments: str(truck.attachments),
          designation: str(truck.designation),
          nameplate_verified_on: str(truck.nameplate_verified_on),
          notes: str(truck.notes)
        }}
      />
    </div>
  )
}

export default EditTruckPage
