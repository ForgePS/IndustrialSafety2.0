import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { updateEvent } from '@/app/(back)/environmental/actions'
import { eventFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, listPermits, loadEvent, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit environmental event' }

/** Port slice 17: edit an open event (including recording the agency notice). */
const EditEventPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadEvent({ organizationId, rights, id })

  if (!found || !found.canManage || found.event.status === 'closed') notFound()

  const event = found.event
  const [locations, permits] = await Promise.all([companyLocations(organizationId), listPermits({ organizationId, rights })])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Edit {event.event_number}</h1>
      <FieldForm
        formKey='event'
        fields={eventFields(
          scopedLocations(locations, rights.manage),
          permits.map((permit: any) => ({ id: permit.id, name: `${permit.title}${permit.permit_number ? ' (' + permit.permit_number + ')' : ''}` }))
        )}
        initial={{
          eventType: event.event_type,
          occurredAt: event.occurred_at,
          locationId: event.location_id,
          permitId: event.permit_id || '',
          substance: event.substance || '',
          quantity: event.quantity === null ? '' : String(event.quantity),
          unit: event.unit || '',
          contained: event.contained,
          media: event.media || [],
          description: event.description,
          immediateActions: event.immediate_actions || '',
          reportable: event.reportable,
          agencyName: event.agency_name || '',
          agencyNotifiedAt: event.agency_notified_at || '',
          agencyReference: event.agency_reference || ''
        }}
        action={updateEvent.bind(null, event.id)}
        goTo='/environmental/events/{id}'
      />
    </div>
  )
}

export default EditEventPage
