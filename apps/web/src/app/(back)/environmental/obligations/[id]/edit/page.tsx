import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { saveObligation } from '@/app/(back)/environmental/actions'
import { obligationFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, companyMembers, envRights, listPermits, loadObligation, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit environmental obligation' }

/** Port slice 17: edit an obligation (saving it also resumes it). */
const EditObligationPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadObligation({ organizationId, rights, id })

  if (!found || !found.canManage) notFound()

  const item = found.obligation
  const [locations, permits, members] = await Promise.all([companyLocations(organizationId), listPermits({ organizationId, rights }), companyMembers(organizationId)])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Edit {item.title}</h1>
      <FieldForm
        formKey='obligation'
        fields={obligationFields(
          scopedLocations(locations, rights.manage),
          permits.map((permit: any) => ({ id: permit.id, name: permit.title })),
          members
        )}
        initial={{
          title: item.title,
          obligationType: item.obligation_type,
          frequency: item.frequency,
          nextDueOn: item.next_due_on || '',
          locationId: item.location_id,
          permitId: item.permit_id || '',
          ownerUserId: item.owner_user_id || '',
          notes: item.notes || ''
        }}
        action={saveObligation.bind(null, item.id)}
        goTo='/environmental/obligations/{id}'
      />
    </div>
  )
}

export default EditObligationPage
