import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import PhaForm from '@/components/process-safety/PhaForm'
import { companyLocations, listMocs, loadPha, psmRights } from '@/lib/forgeProcessSafety'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit hazard analysis' }

/** Port slice 16: edit a process hazard analysis. */
const EditPhaPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('process_safety.manage')
  const organizationId = context.activeOrganization.id
  const rights = await psmRights(organizationId, context.user.id, context.access)
  const found = await loadPha({ organizationId, rights, id })

  if (!found || !found.canManage || found.pha.archived_at) notFound()

  const scope = rights.manage?.locations ?? null
  const [locations, mocs] = await Promise.all([companyLocations(organizationId), listMocs({ organizationId, rights })])
  const pha = found.pha

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Edit {pha.pha_number}</h1>
      <PhaForm
        id={pha.id}
        initial={{
          title: pha.title,
          processUnit: pha.process_unit,
          locationId: pha.location_id,
          method: pha.method,
          status: pha.status,
          leaderName: pha.leader_name || '',
          team: pha.team || '',
          startedOn: pha.started_on || '',
          completedOn: pha.completed_on || '',
          revalidateBy: pha.revalidate_by || '',
          summary: pha.summary || '',
          mocId: pha.moc_id || ''
        }}
        locations={scope === null ? locations : locations.filter(location => scope.includes(location.id))}
        mocs={mocs.map((moc: any) => ({ id: moc.id, name: `${moc.moc_number}: ${moc.title}` }))}
      />
    </div>
  )
}

export default EditPhaPage
