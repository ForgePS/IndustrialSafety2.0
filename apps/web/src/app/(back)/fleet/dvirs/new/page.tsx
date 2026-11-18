import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'

import { submitOfficeDvirAction } from '../actions'
import DvirForm from '@/components/fleet/DvirForm'
import FleetTabs from '@/components/fleet/FleetTabs'
import { loadVehicle } from '@/lib/forgeFleetAccess'
import { isRemovedStatus, todayIso, VEHICLE_STATUS_LABELS, vehicleDisplayName } from '@/lib/forgeFleetRules'
import type { VehicleStatus } from '@/lib/forgeFleetRules'
import { canOnVehicle, dvirVehicleOptions, memberIdentity } from '@/lib/forgeFleetDvirs'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'New DVIR' }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

/**
 * Port slice 11 (piece B): a driver's DVIR from the office. Without ?vehicle= the page asks for the vehicle
 * (any vehicle in the viewer's fleet.dvir scope that is still in the fleet).
 */
const NewDvirPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('fleet.dvir')
  const organizationId = context.activeOrganization.id
  const permissions = context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)
  const vehicleId = one((await searchParams).vehicle)
  const options = await dvirVehicleOptions({ organizationId, userId: context.user.id, scope: context.permission.scope ?? null })

  const vehicle = /^[0-9a-f-]{36}$/i.test(vehicleId) ? await loadVehicle({ organizationId, vehicleId }) : null
  const allowed = vehicle ? await canOnVehicle({ access: context.access, key: 'fleet.dvir', organizationId, userId: context.user.id, vehicle }) : false
  const usable = Boolean(vehicle && allowed && !vehicle.archived_at && !isRemovedStatus(vehicle.status))
  const identity = await memberIdentity(organizationId, context.user.id)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Fleet</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>New DVIR</h1>
        <p className='text-textSecondary mt-2'>Driver Vehicle Inspection Report. Answer every item, describe each defect and sign.</p>
      </div>

      <FleetTabs active='dvirs' permissions={permissions} />

      <Card>
        <CardHeader>
          <CardTitle>Vehicle</CardTitle>
          {vehicleId && !usable ? (
            <CardDescription className='text-red-700' data-testid='dvir-vehicle-refused'>
              {!vehicle || !allowed ? 'That vehicle was not found or is outside your fleet access.' : 'That vehicle has been removed from the fleet.'}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <form method='get' className='flex flex-wrap items-end gap-3'>
            <div className='flex min-w-64 flex-1 flex-col gap-1'>
              <Label htmlFor='dvir-new-vehicle'>Vehicle</Label>
              <select id='dvir-new-vehicle' name='vehicle' defaultValue={usable ? vehicleId : ''} className='border-input bg-background h-10 rounded-md border px-3 text-sm' required>
                <option value=''>Choose a vehicle</option>
                {options.map(item => (
                  <option key={item.id} value={item.id}>
                    {vehicleDisplayName(item)}
                    {item.dot_regulated ? '' : ' (not DOT-regulated)'}
                    {item.status !== 'active' ? ` · ${VEHICLE_STATUS_LABELS[item.status as VehicleStatus] || item.status}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <Button type='submit' variant='outline'>
              {usable ? 'Change vehicle' : 'Continue'}
            </Button>
          </form>
          {usable && vehicle && !vehicle.dot_regulated ? (
            <p className='text-textSecondary mt-3 text-sm' data-testid='dvir-not-dot'>
              This vehicle is not marked DOT-regulated. A DVIR is not required for it, but you can still record one.
            </p>
          ) : null}
          {usable && vehicle?.status === 'out_of_service' ? (
            <p className='mt-3 text-sm text-red-700'>This vehicle is out of service{vehicle.out_of_service_reason ? `: ${vehicle.out_of_service_reason}` : '.'}</p>
          ) : null}
          {!options.length ? (
            <p className='text-textSecondary mt-3 text-sm'>
              No vehicles are available to you. <Link href='/fleet/vehicles' className='text-primary'>Open the vehicle list</Link>.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {usable && vehicle ? (
        <DvirForm
          mode='office'
          submit={submitOfficeDvirAction.bind(null, vehicle.id)}
          vehicle={{ name: vehicleDisplayName(vehicle), number: vehicle.vehicle_number, mileage: vehicle.mileage ?? null }}
          today={todayIso()}
          defaultDriverName={identity.name}
        />
      ) : null}
    </div>
  )
}

export default NewDvirPage
