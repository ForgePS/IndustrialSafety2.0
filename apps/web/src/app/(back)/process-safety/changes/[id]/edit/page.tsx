import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import MocForm from '@/components/process-safety/MocForm'
import { companyAssets, companyLocations, loadMoc, ownerCandidates, psmRights } from '@/lib/forgeProcessSafety'
import { stepAllowed } from '@/lib/forgeProcessSafetyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit change' }

/** Port slice 16: edit a draft or rejected change. */
const EditMocPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('process_safety.manage')
  const organizationId = context.activeOrganization.id
  const rights = await psmRights(organizationId, context.user.id, context.access)
  const found = await loadMoc({ organizationId, rights, id })

  if (!found || !found.canManage || !stepAllowed('edit', found.moc.status)) notFound()

  const scope = rights.manage?.locations ?? null
  const [locations, assets, members] = await Promise.all([companyLocations(organizationId), companyAssets(organizationId), ownerCandidates(organizationId)])
  const moc = found.moc

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Edit {moc.moc_number}</h1>
      <MocForm
        id={moc.id}
        initial={{
          title: moc.title,
          changeType: moc.change_type,
          locationId: moc.location_id,
          assetId: moc.asset_id || '',
          description: moc.description,
          reason: moc.reason,
          technicalBasis: moc.technical_basis || '',
          riskLevel: moc.risk_level,
          ownerUserId: moc.owner_user_id || '',
          temporaryUntil: moc.temporary_until || ''
        }}
        initialImpacts={moc.impacts || []}
        initialTemporary={moc.is_temporary}
        initialPssr={moc.requires_pssr}
        locations={scope === null ? locations : locations.filter(location => scope.includes(location.id))}
        assets={assets}
        members={members}
      />
    </div>
  )
}

export default EditMocPage
