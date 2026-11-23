import type { Metadata } from 'next'

import CompanyForm from '@/components/contractors/CompanyForm'
import { companyLocations, contractorRights } from '@/lib/forgeContractors'
import { loadMembers } from '@/lib/forgeDocumentLibraryServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add contractor company' }

/** Port slice 15: add a contractor company. It starts pending approval. */
const NewContractorPage = async () => {
  const context = await requireTenantPermission('contractor_safety.manage')
  const organizationId = context.activeOrganization.id
  const rights = await contractorRights(organizationId, context.user.id, context.access)
  const scope = rights.manage?.locations ?? null
  const [locations, members] = await Promise.all([companyLocations(organizationId), loadMembers(organizationId)])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Add contractor company</h1>
      <CompanyForm
        initial={{}}
        initialLocations={[]}
        locations={scope === null ? locations : locations.filter(location => scope.includes(location.id))}
        members={members}
        anywhereAllowed={scope === null}
      />
    </div>
  )
}

export default NewContractorPage
