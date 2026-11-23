import type { Metadata } from 'next'

import { savePermit } from '@/app/(back)/environmental/actions'
import { permitFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, linkableDocuments, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add environmental permit' }

/** Port slice 17: add a permit. */
const NewPermitPage = async () => {
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const [locations, documents] = await Promise.all([companyLocations(organizationId), linkableDocuments(organizationId)])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Add environmental permit</h1>
      <FieldForm formKey='permit' fields={permitFields(scopedLocations(locations, rights.manage), documents)} initial={{ status: 'active' }} action={savePermit.bind(null, null)} goTo='/environmental/permits/{id}' />
    </div>
  )
}

export default NewPermitPage
