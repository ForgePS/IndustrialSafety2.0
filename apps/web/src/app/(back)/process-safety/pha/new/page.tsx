import type { Metadata } from 'next'

import PhaForm from '@/components/process-safety/PhaForm'
import { companyLocations, listMocs, psmRights } from '@/lib/forgeProcessSafety'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Record a hazard analysis' }

/** Port slice 16: record a process hazard analysis. */
const NewPhaPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('process_safety.manage')
  const organizationId = context.activeOrganization.id
  const rights = await psmRights(organizationId, context.user.id, context.access)
  const scope = rights.manage?.locations ?? null
  const mocId = (await searchParams).moc || ''
  const [locations, mocs] = await Promise.all([companyLocations(organizationId), listMocs({ organizationId, rights })])

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Record a hazard analysis</h1>
      <PhaForm
        initial={{ status: 'planned', mocId }}
        locations={scope === null ? locations : locations.filter(location => scope.includes(location.id))}
        mocs={mocs.map((moc: any) => ({ id: moc.id, name: `${moc.moc_number}: ${moc.title}` }))}
      />
    </div>
  )
}

export default NewPhaPage
