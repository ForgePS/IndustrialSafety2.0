import type { Metadata } from 'next'

import { saveObligation } from '@/app/(back)/environmental/actions'
import { obligationFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, companyMembers, envRights, listPermits, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add environmental obligation' }

/** Port slice 17: add a recurring obligation, optionally under a permit. */
const NewObligationPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const permitId = (await searchParams).permit || ''
  const rights = await envRights(organizationId, context.user.id, context.access)
  const [locations, permits, members] = await Promise.all([companyLocations(organizationId), listPermits({ organizationId, rights }), companyMembers(organizationId)])
  const permit = permits.find((item: any) => item.id === permitId)

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Add environmental obligation</h1>
      <FieldForm
        formKey='obligation'
        fields={obligationFields(
          scopedLocations(locations, rights.manage),
          permits.map((item: any) => ({ id: item.id, name: item.title })),
          members
        )}
        initial={permit ? { permitId: permit.id, locationId: permit.location_id } : {}}
        action={saveObligation.bind(null, null)}
        goTo='/environmental/obligations/{id}'
      />
    </div>
  )
}

export default NewObligationPage
