import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import CompanyForm from '@/components/contractors/CompanyForm'
import { companyLocations, contractorRights, loadCompany } from '@/lib/forgeContractors'
import { loadMembers } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit contractor company' }

const NUMBER = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** Port slice 15: edit a contractor company. */
const EditContractorPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('contractor_safety.manage')
  const organizationId = context.activeOrganization.id
  const rights = await contractorRights(organizationId, context.user.id, context.access)
  const found = await loadCompany({ organizationId, rights, id })

  if (!found || !found.canManage || found.company.archived_at) notFound()

  const scope = rights.manage?.locations ?? null
  const [locations, members] = await Promise.all([companyLocations(organizationId), loadMembers(organizationId)])
  const company = found.company

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Edit {company.name}</h1>
      <CompanyForm
        id={company.id}
        initial={{
          name: company.name,
          trade: company.trade || '',
          contactName: company.contact_name || '',
          contactEmail: company.contact_email || '',
          contactPhone: company.contact_phone || '',
          sponsorUserId: company.sponsor_user_id || '',
          emr: NUMBER(company.emr),
          trir: NUMBER(company.trir),
          notes: company.notes || ''
        }}
        initialLocations={company.location_ids}
        locations={scope === null ? locations : locations.filter(location => scope.includes(location.id))}
        members={members}
        anywhereAllowed={scope === null}
      />
    </div>
  )
}

export default EditContractorPage
