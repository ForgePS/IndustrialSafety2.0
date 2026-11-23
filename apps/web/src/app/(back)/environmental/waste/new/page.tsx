import type { Metadata } from 'next'

import { saveShipment } from '@/app/(back)/environmental/actions'
import { shipmentFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Record waste shipment' }

/** Port slice 17: record a hazardous waste shipment by its manifest. */
const NewShipmentPage = async () => {
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const locations = await companyLocations(organizationId)

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Record waste shipment</h1>
      <FieldForm formKey='shipment' fields={shipmentFields(scopedLocations(locations, rights.manage))} initial={{}} action={saveShipment.bind(null, null)} goTo='/environmental/waste' />
    </div>
  )
}

export default NewShipmentPage
