import type { Metadata } from 'next'

import MocForm from '@/components/process-safety/MocForm'
import { companyAssets, companyLocations, ownerCandidates, psmRights } from '@/lib/forgeProcessSafety'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Raise a change' }

/** Port slice 16: raise a management of change. It starts as a draft. */
const NewMocPage = async () => {
  const context = await requireTenantPermission('process_safety.manage')
  const organizationId = context.activeOrganization.id
  const rights = await psmRights(organizationId, context.user.id, context.access)
  const scope = rights.manage?.locations ?? null
  const [locations, assets, members] = await Promise.all([companyLocations(organizationId), companyAssets(organizationId), ownerCandidates(organizationId)])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Raise a change</h1>
      <MocForm
        initial={{}}
        initialImpacts={[]}
        initialTemporary={false}
        initialPssr
        locations={scope === null ? locations : locations.filter(location => scope.includes(location.id))}
        assets={assets}
        members={members}
      />
    </div>
  )
}

export default NewMocPage
