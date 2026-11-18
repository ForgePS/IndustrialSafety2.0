import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import { loadFleetSettings } from '@/lib/forgeFleetAccess'
import {
  RENEWAL_BUCKETS,
  RENEWAL_BUCKET_LABELS,
  VEHICLE_TYPE_LABELS,
  maintenanceDueState,
  registrationDueDate,
  renewalBucket,
  vehicleDisplayName,
  type VehicleType
} from '@/lib/forgeFleetRules'
import { allowedKeys, loadScopedVehicles, personName } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet' }

const Stat = ({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: 'critical' | 'pending' }) => {
  const body = (
    <Card className='h-full'>
      <CardContent className='p-4'>
        <div className='text-textSecondary text-sm'>{label}</div>
        <div className={'mt-1 text-3xl font-bold ' + (tone === 'critical' && value ? 'text-destructive' : tone === 'pending' && value ? 'text-amber-600' : 'text-textPrimary')}>{value}</div>
      </CardContent>
    </Card>
  )

  return href ? (
    <Link href={href} className='block' data-stat={label}>
      {body}
    </Link>
  ) : (
    <div data-stat={label}>{body}</div>
  )
}

const FleetDashboardPage = async () => {
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id
  const permissions = allowedKeys(context)
  const supabase = createServiceRoleClient() as any

  const [vehicles, settings] = await Promise.all([loadScopedVehicles({ context }), loadFleetSettings(organizationId)])
  const ids = vehicles.map(vehicle => vehicle.id as string)
  const mileageById = new Map(vehicles.map(vehicle => [vehicle.id as string, vehicle.mileage as number | null]))

  const [defects, maintenance] = ids.length
    ? await Promise.all([
        supabase.from('forge_fleet_dvir_defects').select('id, vehicle_id').eq('organization_id', organizationId).eq('status', 'open').in('vehicle_id', ids),
        supabase.from('forge_fleet_maintenance').select('id, vehicle_id, status, due_on, due_mileage').eq('organization_id', organizationId).eq('status', 'open').in('vehicle_id', ids)
      ])
    : [{ data: [] }, { data: [] }]

  const count = (status: string) => vehicles.filter(vehicle => vehicle.status === status).length
  const insured = vehicles.filter(vehicle => vehicle.insurance_status === 'insured').length
  const byType = new Map<string, number>()

  for (const vehicle of vehicles) byType.set(vehicle.vehicle_type, (byType.get(vehicle.vehicle_type) || 0) + 1)

  const buckets = new Map<string, number>()

  for (const vehicle of vehicles) {
    const bucket = renewalBucket(registrationDueDate(vehicle))

    buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
  }

  const dueStates = ((maintenance.data || []) as any[]).map(record => maintenanceDueState(record, mileageById.get(record.vehicle_id), settings.renewal_warning_days))
  const outOfService = vehicles.filter(vehicle => vehicle.status === 'out_of_service')

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader active='dashboard' permissions={permissions} />

      <div className='grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6'>
        <Stat label='In service' value={count('active')} href='/fleet/vehicles?status=active' />
        <Stat label='Out of service' value={count('out_of_service')} href='/fleet/vehicles?status=out_of_service' tone='critical' />
        <Stat label='Inactive' value={count('inactive')} href='/fleet/vehicles?status=inactive' />
        <Stat label='Insured' value={insured} href='/fleet/vehicles?insured=yes' />
        <Stat label='Not insured or unknown' value={vehicles.length - insured} href='/fleet/vehicles?insured=no' tone='pending' />
        <Stat label='Open DVIR defects' value={(defects.data || []).length} href='/fleet/dvirs?status=open' tone='critical' />
        <Stat label='Maintenance overdue' value={dueStates.filter(state => state === 'overdue').length} href='/fleet/maintenance' tone='critical' />
        <Stat label='Maintenance due soon' value={dueStates.filter(state => state === 'due_soon').length} href='/fleet/maintenance' tone='pending' />
        <Stat label='Registration overdue' value={buckets.get('overdue') || 0} href='/fleet/vehicles?registration=overdue' tone='critical' />
        <Stat label='Vehicles' value={vehicles.length} href='/fleet/vehicles' />
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Registration renewals</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='flex flex-col gap-2 text-sm' data-testid='fleet-renewal-buckets'>
              {RENEWAL_BUCKETS.map(bucket => (
                <li key={bucket} className='flex justify-between' data-bucket={bucket}>
                  <span>{RENEWAL_BUCKET_LABELS[bucket]}</span>
                  <span className='font-semibold'>{buckets.get(bucket) || 0}</span>
                </li>
              ))}
            </ul>
            <Link href='/fleet/renewals' className='text-primary mt-4 inline-block text-sm hover:underline'>
              See all renewals
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By type</CardTitle>
          </CardHeader>
          <CardContent>
            {byType.size ? (
              <ul className='flex flex-col gap-2 text-sm'>
                {[...byType.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, total]) => (
                    <li key={type} className='flex justify-between'>
                      <Link className='hover:underline' href={'/fleet/vehicles?type=' + type}>
                        {VEHICLE_TYPE_LABELS[type as VehicleType] || type}
                      </Link>
                      <span className='font-semibold'>{total}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className='text-textSecondary text-sm'>No vehicles yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Out of service</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Driver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outOfService.length ? (
              outOfService.map(vehicle => (
                <TableRow key={vehicle.id} data-out-of-service={vehicle.vehicle_number}>
                  <TableCell>
                    <Link className='text-primary font-semibold hover:underline' href={'/fleet/vehicles/' + vehicle.id}>
                      {vehicleDisplayName(vehicle)}
                    </Link>
                    <div className='text-textSecondary text-xs'>{vehicle.vehicle_number}</div>
                  </TableCell>
                  <TableCell>{vehicle.out_of_service_reason || '—'}</TableCell>
                  <TableCell>{vehicle.locations?.name || '—'}</TableCell>
                  <TableCell>{personName(vehicle.driver) || '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className='py-8 text-center'>
                  Every vehicle is in service.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default FleetDashboardPage
