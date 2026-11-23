import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import WorkerForm from '@/components/contractors/WorkerForm'
import { contractorRights, loadCompany } from '@/lib/forgeContractors'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add contractor worker' }

/** Port slice 15: add a worker to a contractor company. */
const NewWorkerPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const { company: companyId = '' } = await searchParams
  const context = await requireTenantPermission('contractor_safety.manage')
  const organizationId = context.activeOrganization.id
  const found = await loadCompany({ organizationId, rights: await contractorRights(organizationId, context.user.id, context.access), id: companyId })

  if (!found || !found.canManage || found.company.archived_at) notFound()

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Add a worker to {found.company.name}</h1>
      <WorkerForm initial={{ active: true }} companyId={found.company.id} />
    </div>
  )
}

export default NewWorkerPage
