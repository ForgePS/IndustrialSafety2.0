import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import SpaceForm from '@/components/permits/SpaceForm'
import { companyLocations, covers, permitRights } from '@/lib/forgePermitAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Add a confined space' }

/** Port slice 18: add a confined space to the register. */
const NewSpacePage = async ({ params }: { params: Promise<{ type: string }> }) => {
  const { type } = await params

  if (type !== 'confined-space') notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)

  if (!rights.manage) redirect('/permits/confined-space/spaces')

  const locations = (await companyLocations(organizationId)).filter(location => covers(rights.manage, location.id))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/permits/confined-space/spaces' className='text-primary text-sm hover:underline'>
          ← Confined spaces
        </Link>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Add a confined space</h1>
      </div>
      <SpaceForm
        locations={locations}
        initial={{
          locationId: locations.length === 1 ? locations[0].id : '',
          spaceCode: '',
          name: '',
          description: '',
          permitRequired: true,
          hazards: [],
          entryPoints: '',
          isolationNotes: '',
          rescuePlan: '',
          lastEvaluatedOn: ''
        }}
      />
    </div>
  )
}

export default NewSpacePage
