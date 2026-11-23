import type { Metadata } from 'next'

import { reportEvent } from '@/app/(back)/environmental/actions'
import { eventFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, listPermits, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Report an environmental event' }

/** Port slice 17: report a spill, release, exceedance, complaint or notice of violation. */
const NewEventPage = async () => {
  const context = await requireTenantPermission('environmental.report')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const [locations, permits] = await Promise.all([companyLocations(organizationId), listPermits({ organizationId, rights })])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Report an environmental event</h1>
      <FieldForm
        formKey='event'
        fields={eventFields(
          scopedLocations(locations, rights.report),
          permits.map((permit: any) => ({ id: permit.id, name: `${permit.title}${permit.permit_number ? ' (' + permit.permit_number + ')' : ''}` }))
        )}
        initial={{ media: [], contained: false, reportable: false }}
        action={reportEvent}
        goTo='/environmental/events/{id}'
        submitLabel='Record event'
      />
    </div>
  )
}

export default NewEventPage
