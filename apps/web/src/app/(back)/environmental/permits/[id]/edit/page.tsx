import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { savePermit } from '@/app/(back)/environmental/actions'
import { permitFields } from '@/components/environmental/fields'
import FieldForm from '@/components/environmental/FieldForm'
import { companyLocations, envRights, linkableDocuments, loadPermit, scopedLocations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit environmental permit' }

/** Port slice 17: edit a permit. */
const EditPermitPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('environmental.manage')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadPermit({ organizationId, rights, id })

  if (!found || !found.canManage || found.permit.archived_at) notFound()

  const permit = found.permit
  const [locations, documents] = await Promise.all([companyLocations(organizationId), linkableDocuments(organizationId)])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Edit {permit.title}</h1>
      <FieldForm
        formKey='permit'
        fields={permitFields(scopedLocations(locations, rights.manage), documents)}
        initial={{
          title: permit.title,
          permitType: permit.permit_type,
          permitNumber: permit.permit_number || '',
          agency: permit.agency,
          locationId: permit.location_id,
          status: permit.status,
          issuedOn: permit.issued_on || '',
          effectiveOn: permit.effective_on || '',
          expiresOn: permit.expires_on || '',
          documentId: permit.document_id || '',
          notes: permit.notes || ''
        }}
        action={savePermit.bind(null, permit.id)}
        goTo='/environmental/permits/{id}'
      />
    </div>
  )
}

export default EditPermitPage
