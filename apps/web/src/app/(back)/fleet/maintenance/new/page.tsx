import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { FleetPageHeader, allowedKeys } from '@/components/fleet/MaintenanceBadges'
import MaintenanceForm from '@/components/fleet/MaintenanceForm'
import { vehicleScopeFilter } from '@/lib/forgeFleetAccess'
import { REMOVED_STATUSES, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New Maintenance' }

const NewMaintenancePage = async ({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) => {
  const context = await requireTenantPermission('fleet.maintenance')
  const organizationId = context.activeOrganization.id
  const { vehicle } = await searchParams
  const scopeFilter = await vehicleScopeFilter({ organizationId, userId: context.user.id, scope: context.permission.scope })

  let query = (createServiceRoleClient() as any)
    .from('forge_fleet_vehicles')
    .select('id, vehicle_number, unit_number, year, make, model, mileage')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .not('status', 'in', `(${REMOVED_STATUSES.join(',')})`)
    .order('vehicle_number')

  if (scopeFilter) query = query.or(scopeFilter)

  const { data } = await query
  const vehicles = ((data || []) as any[]).map(item => ({ id: item.id as string, name: vehicleDisplayName(item), mileage: item.mileage as number | null }))
  const preselected = vehicles.some(item => item.id === vehicle) ? vehicle! : ''

  return (
    <div className='flex flex-col gap-6'>
      <FleetPageHeader active='maintenance' permissions={allowedKeys(context)} title='Fleet' subtitle='Schedule maintenance, a repair or a recall for a vehicle.' />
      <Card className='max-w-4xl'>
        <CardHeader>
          <CardTitle>New maintenance</CardTitle>
          <CardDescription>Pick a common job or type your own.</CardDescription>
        </CardHeader>
        <CardContent>
          {vehicles.length ? (
            <MaintenanceForm
              vehicles={vehicles}
              initial={{ vehicleId: preselected, title: '', maintenanceType: 'pm', dueOn: '', dueMileage: '', vendor: '', cost: '', repeatDays: '', repeatMiles: '', notes: '' }}
            />
          ) : (
            <p className='text-textSecondary text-sm'>There are no vehicles you can schedule maintenance for.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default NewMaintenancePage
