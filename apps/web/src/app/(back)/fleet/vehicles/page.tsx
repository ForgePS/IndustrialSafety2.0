import type { Metadata } from 'next'
import Link from 'next/link'
import { TbFileImport, TbPlus } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import VehicleStatusBadge, { VehiclePill } from '@/components/fleet/VehicleStatusBadge'
import {
  INSURANCE_STATUS_LABELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  registrationDueDate,
  renewalBucket,
  vehicleDisplayName,
  type VehicleType
} from '@/lib/forgeFleetRules'
import { allowedKeys, loadLocationsAndDivisions, loadScopedVehicles, personName } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet Vehicles' }

type Search = { q?: string; type?: string; status?: string; location?: string; insured?: string; dot?: string; registration?: string }

const selectClass = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const VehiclesPage = async ({ searchParams }: { searchParams: Promise<Search> }) => {
  const context = await requireTenantPermission('fleet.view')
  const permissions = allowedKeys(context)
  const params = await searchParams
  const search = String(params.q || '').trim().toLowerCase()

  const [all, places] = await Promise.all([loadScopedVehicles({ context }), loadLocationsAndDivisions(context.activeOrganization.id)])

  const vehicles = all.filter(vehicle => {
    if (search) {
      const haystack = [vehicle.vehicle_number, vehicle.unit_number, vehicle.vin, vehicle.license_plate, vehicle.make, vehicle.model, `${vehicle.make || ''} ${vehicle.model || ''}`, personName(vehicle.driver), vehicle.driver?.employee_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(search)) return false
    }

    if (params.type && vehicle.vehicle_type !== params.type) return false
    if (params.status && vehicle.status !== params.status) return false
    if (params.location && vehicle.location_id !== params.location) return false
    if (params.insured === 'yes' && vehicle.insurance_status !== 'insured') return false
    if (params.insured === 'no' && vehicle.insurance_status === 'insured') return false
    if (params.dot === 'yes' && !vehicle.dot_regulated) return false
    if (params.dot === 'no' && vehicle.dot_regulated) return false
    if (params.registration === 'overdue' && renewalBucket(registrationDueDate(vehicle)) !== 'overdue') return false

    return true
  })

  const filtered = Boolean(search || params.type || params.status || params.location || params.insured || params.dot || params.registration)

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader
        active='vehicles'
        permissions={permissions}
        actions={
          permissions.includes('fleet.create') ? (
            <>
              <Button variant='outline' asChild>
                <Link href='/fleet/import'>
                  <TbFileImport />
                  Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href='/fleet/vehicles/new'>
                  <TbPlus />
                  New vehicle
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <form className='flex flex-wrap items-center gap-3' action='/fleet/vehicles'>
        <input name='q' defaultValue={params.q || ''} placeholder='Search unit, VIN, plate, make, model or driver' className='border-input bg-card h-[38px] w-80 rounded-md border px-3 text-sm' />
        <select name='type' defaultValue={params.type || ''} className={selectClass} aria-label='Type'>
          <option value=''>Any type</option>
          {VEHICLE_TYPES.map(type => (
            <option key={type} value={type}>
              {VEHICLE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select name='status' defaultValue={params.status || ''} className={selectClass} aria-label='Status'>
          <option value=''>Any status</option>
          <option value='active'>In service</option>
          <option value='out_of_service'>Out of service</option>
          <option value='inactive'>Inactive</option>
        </select>
        <select name='location' defaultValue={params.location || ''} className={selectClass} aria-label='Location'>
          <option value=''>Any location</option>
          {places.locations.map(location => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <select name='insured' defaultValue={params.insured || ''} className={selectClass} aria-label='Insured'>
          <option value=''>Insured or not</option>
          <option value='yes'>Insured</option>
          <option value='no'>Not insured / unknown</option>
        </select>
        <select name='dot' defaultValue={params.dot || ''} className={selectClass} aria-label='DOT regulated'>
          <option value=''>DOT or not</option>
          <option value='yes'>DOT regulated</option>
          <option value='no'>Not DOT regulated</option>
        </select>
        <select name='registration' defaultValue={params.registration || ''} className={selectClass} aria-label='Registration'>
          <option value=''>Any registration</option>
          <option value='overdue'>Registration overdue</option>
        </select>
        <Button type='submit' size='sm' variant='outline'>
          Apply
        </Button>
        {filtered ? (
          <Link className='text-primary text-sm hover:underline' href='/fleet/vehicles'>
            Clear
          </Link>
        ) : null}
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>VIN / plate</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Mileage</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.length ? (
              vehicles.map(vehicle => {
                const overdue = renewalBucket(registrationDueDate(vehicle)) === 'overdue'

                return (
                  <TableRow key={vehicle.id} data-vehicle={vehicle.vehicle_number}>
                    <TableCell>
                      <Link className='text-primary font-semibold hover:underline' href={'/fleet/vehicles/' + vehicle.id}>
                        {vehicleDisplayName(vehicle)}
                      </Link>
                      <div className='text-textSecondary text-xs'>{vehicle.vehicle_number}</div>
                    </TableCell>
                    <TableCell>{vehicle.vehicle_type === 'other' && vehicle.custom_type_label ? vehicle.custom_type_label : VEHICLE_TYPE_LABELS[vehicle.vehicle_type as VehicleType]}</TableCell>
                    <TableCell>
                      <div className='font-mono text-xs'>{vehicle.vin || '—'}</div>
                      <div className='text-textSecondary text-xs'>{[vehicle.license_plate, vehicle.license_state].filter(Boolean).join(' · ') || ''}</div>
                    </TableCell>
                    <TableCell>{vehicle.locations?.name || '—'}</TableCell>
                    <TableCell>{personName(vehicle.driver) || '—'}</TableCell>
                    <TableCell>{vehicle.mileage != null ? Number(vehicle.mileage).toLocaleString('en-US') : '—'}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        <VehicleStatusBadge status={vehicle.status} />
                        {vehicle.dot_regulated ? <VehiclePill tone='muted'>DOT</VehiclePill> : null}
                        {vehicle.insurance_status !== 'insured' ? (
                          <VehiclePill tone='pending'>{INSURANCE_STATUS_LABELS[vehicle.insurance_status as keyof typeof INSURANCE_STATUS_LABELS]} insurance</VehiclePill>
                        ) : null}
                        {overdue ? <VehiclePill tone='critical'>Registration overdue</VehiclePill> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className='py-10 text-center'>
                  {filtered ? 'No vehicles match.' : 'No vehicles yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default VehiclesPage
