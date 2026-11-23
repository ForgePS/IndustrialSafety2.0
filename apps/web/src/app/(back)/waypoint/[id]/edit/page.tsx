import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import AreaForm from '@/components/waypoint/AreaForm'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  loadAreaForUser,
  loadAreaLocations,
  loadAreaLookups,
  waypointLocationIds,
  type WaypointContext
} from '@/lib/forgeWaypoint'

export const metadata: Metadata = { title: 'Edit Area' }

const EditAreaPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = (await requireTenantPermission('waypoint.manage')) as unknown as WaypointContext & {
    activeOrganization: { id: string; name: string }
  }
  const organizationId = context.activeOrganization.id
  const { id } = await params
  const area = await loadAreaForUser(context, id, 'waypoint.manage')

  if (!area) notFound()
  if (area.archived_at) redirect('/waypoint/' + area.id)

  const [locations, lookups] = await Promise.all([
    loadAreaLocations(organizationId, await waypointLocationIds(context, 'waypoint.manage')),
    loadAreaLookups(organizationId)
  ])

  // Keep the current location selectable even if it was deactivated since.
  const locationOptions = locations.some(item => item.id === area.location_id)
    ? locations
    : [...locations, { id: area.location_id, label: (area.location_name || 'Location') + ' (inactive)' }]

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
          {context.activeOrganization.name} / Waypoint
        </p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Edit {area.name}</h1>
      </div>
      <Card className='max-w-4xl'>
        <CardHeader>
          <CardTitle>Area</CardTitle>
        </CardHeader>
        <CardContent>
          <AreaForm
            areaId={area.id}
            initial={{
              name: area.name,
              code: area.code || '',
              locationId: area.location_id,
              description: area.description || '',
              hazards: area.hazards,
              requiredPpe: area.required_ppe,
              restrictedEntry: area.restricted_entry,
              entryRequirements: area.entry_requirements || '',
              nearestExit: area.nearest_exit || '',
              musterPoint: area.muster_point || '',
              nearestEyewash: area.nearest_eyewash || '',
              nearestExtinguisher: area.nearest_extinguisher || '',
              nearestFirstAid: area.nearest_first_aid || '',
              emergencyNotes: area.emergency_notes || ''
            }}
            locations={locationOptions}
            hazards={lookups.hazards}
            ppe={lookups.ppe}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default EditAreaPage
