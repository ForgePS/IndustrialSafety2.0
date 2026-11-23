import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { archiveShipment, saveShipment } from '@/app/(back)/environmental/actions'
import ActionButton from '@/components/emergency/ActionButton'
import { shipmentFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, loadShipment, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Waste shipment' }

/** Port slice 17: update a shipment, usually to record the signed copy or the exception report. */
const EditShipmentPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadShipment({ organizationId, rights, id })

  if (!found || !found.canManage) notFound()

  const shipment = found.shipment
  const locations = await companyLocations(organizationId)

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>Manifest {shipment.manifest_number}</h1>
        <ActionButton
          run={archiveShipment.bind(null, shipment.id, !shipment.archived_at)}
          label={shipment.archived_at ? 'Restore' : 'Archive'}
          confirm={shipment.archived_at ? undefined : 'Archive this shipment?'}
          goTo='/environmental/waste'
        />
      </div>
      {shipment.archived_at ? (
        <p className='text-textSecondary text-sm'>Archived. Restore it to change it.</p>
      ) : (
        <FieldForm
          formKey='shipment'
          fields={shipmentFields(scopedLocations(locations, rights.manage))}
          initial={{
            manifestNumber: shipment.manifest_number,
            shippedOn: shipment.shipped_on,
            locationId: shipment.location_id,
            generatorStatus: shipment.generator_status,
            wasteDescription: shipment.waste_description,
            wasteCodes: (shipment.waste_codes || []).join(', '),
            quantity: String(shipment.quantity),
            unit: shipment.unit,
            transporter: shipment.transporter,
            facility: shipment.facility,
            returnReceivedOn: shipment.return_received_on || '',
            exceptionFiledOn: shipment.exception_filed_on || '',
            notes: shipment.notes || ''
          }}
          action={saveShipment.bind(null, shipment.id)}
          goTo='/environmental/waste'
        />
      )}
    </div>
  )
}

export default EditShipmentPage
