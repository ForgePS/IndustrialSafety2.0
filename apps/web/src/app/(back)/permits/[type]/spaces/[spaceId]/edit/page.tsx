import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import SpaceForm from '@/components/permits/SpaceForm'
import { companyLocations, covers, loadSpace, permitRights, viewGrant } from '@/lib/forgePermitAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Edit confined space' }

/** Port slice 18: edit a confined space. */
const EditSpacePage = async ({ params }: { params: Promise<{ type: string; spaceId: string }> }) => {
  const { type, spaceId } = await params

  if (type !== 'confined-space') notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)
  const space = await loadSpace(organizationId, spaceId)

  if (!space || !covers(viewGrant(rights), space.location_id)) notFound()
  if (!covers(rights.manage, space.location_id)) redirect('/permits/confined-space/spaces/' + space.id)

  const locations = (await companyLocations(organizationId)).filter(location => covers(rights.manage, location.id))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={'/permits/confined-space/spaces/' + space.id} className='text-primary text-sm hover:underline'>
          ← {space.name}
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Edit {space.name}</h1>
      </div>
      <SpaceForm
        spaceId={space.id}
        locations={locations}
        initial={{
          locationId: space.location_id,
          spaceCode: space.space_code || '',
          name: space.name,
          description: space.description || '',
          permitRequired: space.permit_required,
          hazards: space.hazards || [],
          entryPoints: space.entry_points || '',
          isolationNotes: space.isolation_notes || '',
          rescuePlan: space.rescue_plan || '',
          lastEvaluatedOn: space.last_evaluated_on || ''
        }}
      />
    </div>
  )
}

export default EditSpacePage
