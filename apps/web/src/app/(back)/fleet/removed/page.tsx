import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import VehiclePageHeader from '@/components/fleet/VehiclePageHeader'
import VehicleRestoreButton from '@/components/fleet/VehicleRestoreButton'
import VehicleStatusBadge from '@/components/fleet/VehicleStatusBadge'
import { vehicleDisplayName } from '@/lib/forgeFleetRules'
import { allowedKeys, loadScopedVehicles } from '@/lib/forgeFleetVehicles'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Removed Vehicles' }

/** Port slice 11: vehicles removed from the fleet (removed / sold / disposed), with disposition details. */
const RemovedVehiclesPage = async () => {
  const context = await requireTenantPermission('fleet.view')
  const permissions = allowedKeys(context)
  const canRestore = permissions.includes('fleet.retire')
  const vehicles = (await loadScopedVehicles({ context, removed: true })).sort((a, b) => String(b.disposition_date || '').localeCompare(String(a.disposition_date || '')))

  return (
    <div className='flex flex-col gap-6'>
      <VehiclePageHeader active='removed' permissions={permissions} subtitle='Vehicles removed, sold or disposed of. Restoring one puts it back as inactive.' />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>VIN / plate</TableHead>
              <TableHead>Disposition</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.length ? (
              vehicles.map(vehicle => (
                <TableRow key={vehicle.id} data-removed-vehicle={vehicle.vehicle_number}>
                  <TableCell>
                    <Link className='text-primary font-semibold hover:underline' href={'/fleet/vehicles/' + vehicle.id}>
                      {vehicleDisplayName(vehicle)}
                    </Link>
                    <div className='text-textSecondary text-xs'>{vehicle.vehicle_number}</div>
                  </TableCell>
                  <TableCell>
                    <div className='font-mono text-xs'>{vehicle.vin || '—'}</div>
                    <div className='text-textSecondary text-xs'>{vehicle.license_plate || ''}</div>
                  </TableCell>
                  <TableCell>
                    <VehicleStatusBadge status={vehicle.status} />
                  </TableCell>
                  <TableCell>{vehicle.disposition_date || '—'}</TableCell>
                  <TableCell className='max-w-80 whitespace-pre-wrap'>{vehicle.disposition_notes || '—'}</TableCell>
                  <TableCell className='text-right'>{canRestore ? <VehicleRestoreButton vehicleId={vehicle.id} /> : null}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className='py-10 text-center'>
                  No removed vehicles.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default RemovedVehiclesPage
