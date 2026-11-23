import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import { hazardLabels } from '@/components/permits/PermitDetails'
import PermitTabs from '@/components/permits/PermitTabs'
import { formatDate } from '@/components/permits/format'
import { companyLocations, listPermits, listSpaces, permitRights, viewGrant } from '@/lib/forgePermitAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Confined spaces' }

/** Port slice 18: the confined space register. */
const SpacesPage = async ({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const { type } = await params

  if (type !== 'confined-space') notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)
  const grant = viewGrant(rights)
  const query = await searchParams
  const showArchived = query.archived === '1'

  const [spaces, permits, locations] = await Promise.all([
    grant ? listSpaces({ organizationId, grant, includeArchived: showArchived }) : Promise.resolve([]),
    listPermits({ organizationId, rights, type: 'confined_space', open: true }),
    companyLocations(organizationId)
  ])

  const openCount = new Map<string, number>()

  for (const permit of permits as any[]) if (permit.status !== 'draft') openCount.set(permit.space_id, (openCount.get(permit.space_id) || 0) + 1)
  const names = new Map(locations.map(location => [location.id, location.name]))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Confined spaces</h1>
          <p className='text-textSecondary mt-2'>Every confined space, its hazards and rescue plan. Entry permits are written against a permit-required space.</p>
        </div>
        {rights.manage ? (
          <Button asChild>
            <Link href='/permits/confined-space/spaces/new'>Add a space</Link>
          </Button>
        ) : null}
      </div>
      <PermitTabs active='spaces' canManage={Boolean(rights.manage)} />
      <Link href={'/permits/confined-space/spaces' + (showArchived ? '' : '?archived=1')} className='text-primary text-sm hover:underline' data-archived-toggle>
        {showArchived ? 'Hide archived spaces' : 'Show archived spaces'}
      </Link>
      {spaces.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-space-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Space</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Hazards</th>
                  <th className='px-4 py-2 font-semibold'>Last evaluated</th>
                  <th className='px-4 py-2 font-semibold'>Open permits</th>
                </tr>
              </thead>
              <tbody>
                {(spaces as any[]).map(space => (
                  <tr key={space.id} className='border-b last:border-0' data-space-row={space.name}>
                    <td className='px-4 py-2'>
                      <Link href={'/permits/confined-space/spaces/' + space.id} className='text-primary font-medium hover:underline'>
                        {space.space_code ? space.space_code + ' ' : ''}
                        {space.name}
                      </Link>
                      <p className='text-textSecondary text-xs'>
                        {space.permit_required ? 'Permit required' : 'Non-permit space'}
                        {space.archived_at ? ' · Archived' : ''}
                      </p>
                    </td>
                    <td className='px-4 py-2'>{names.get(space.location_id) || 'Unknown'}</td>
                    <td className='px-4 py-2'>{hazardLabels(space.hazards)}</td>
                    <td className='px-4 py-2'>{formatDate(space.last_evaluated_on)}</td>
                    <td className='px-4 py-2' data-open-permits>
                      {openCount.get(space.id) || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No confined spaces yet.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default SpacesPage
