import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import AreaForm from '@/components/waypoint/AreaForm'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { loadAreaLocations, loadAreaLookups, waypointLocationIds, type WaypointContext } from '@/lib/forgeWaypoint'

export const metadata: Metadata = { title: 'New Area' }

const NewAreaPage = async ({ searchParams }: { searchParams: Promise<{ location?: string }> }) => {
  const context = (await requireTenantPermission('waypoint.manage')) as unknown as WaypointContext & {
    activeOrganization: { id: string; name: string }
  }
  const organizationId = context.activeOrganization.id
  const { location } = await searchParams

  const [locations, lookups] = await Promise.all([
    loadAreaLocations(organizationId, await waypointLocationIds(context, 'waypoint.manage')),
    loadAreaLookups(organizationId)
  ])
  const locationId =
    location && locations.some(item => item.id === location) ? location : locations.length === 1 ? locations[0].id : ''

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
          {context.activeOrganization.name} / Waypoint
        </p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>New area</h1>
        <p className='text-textSecondary mt-2'>
          Set what people need to know before they walk in. You can place equipment and print the Area Card after
          saving.
        </p>
      </div>
      <Card className='max-w-4xl'>
        <CardHeader>
          <CardTitle>Area</CardTitle>
        </CardHeader>
        <CardContent>
          {locations.length ? (
            <AreaForm
              initial={{
                name: '',
                code: '',
                locationId,
                description: '',
                hazards: [],
                requiredPpe: [],
                restrictedEntry: false,
                entryRequirements: '',
                nearestExit: '',
                musterPoint: '',
                nearestEyewash: '',
                nearestExtinguisher: '',
                nearestFirstAid: '',
                emergencyNotes: ''
              }}
              locations={locations}
              hazards={lookups.hazards}
              ppe={lookups.ppe}
            />
          ) : (
            <p className='text-textSecondary text-sm'>
              There are no active locations in your Waypoint scope to add an area to.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default NewAreaPage
