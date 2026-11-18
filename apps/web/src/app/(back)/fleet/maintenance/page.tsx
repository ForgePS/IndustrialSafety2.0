import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { FleetPageHeader, MaintenanceDueBadge, allowedKeys } from '@/components/fleet/MaintenanceBadges'
import { loadFleetSettings, vehicleScopeFilter } from '@/lib/forgeFleetAccess'
import { listMaintenance } from '@/lib/forgeFleetMaintenance'
import { MAINTENANCE_DUE_FILTERS, MAINTENANCE_DUE_LABELS, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABELS, centsToDollars } from '@/lib/forgeFleetMaintenanceRules'
import { MAINTENANCE_TYPES, MAINTENANCE_TYPE_LABELS, vehicleDisplayName } from '@/lib/forgeFleetRules'
import type { MaintenanceDueState, MaintenanceType } from '@/lib/forgeFleetRules'
import { formatUsDate } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet Maintenance' }

const UUID = /^[0-9a-f-]{36}$/i
const SELECT = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const MaintenancePage = async ({ searchParams }: { searchParams: Promise<{ vehicle?: string; status?: string; type?: string; due?: string }> }) => {
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id
  const permissions = allowedKeys(context)
  const filters = await searchParams
  const vehicleId = filters.vehicle && UUID.test(filters.vehicle) ? filters.vehicle : null
  const status = filters.status === 'all' || (MAINTENANCE_STATUSES as readonly string[]).includes(filters.status || '') ? filters.status! : 'open'
  const type = (MAINTENANCE_TYPES as readonly string[]).includes(filters.type || '') ? filters.type! : null
  const due = MAINTENANCE_DUE_FILTERS.includes(filters.due as MaintenanceDueState) ? (filters.due as MaintenanceDueState) : null
  const settings = await loadFleetSettings(organizationId)
  const scopeFilter = await vehicleScopeFilter({ organizationId, userId: context.user.id, scope: context.permission.scope })

  let vehicleQuery = (createServiceRoleClient() as any)
    .from('forge_fleet_vehicles')
    .select('id, vehicle_number, unit_number, year, make, model')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('vehicle_number')

  if (scopeFilter) vehicleQuery = vehicleQuery.or(scopeFilter)

  const [{ data: vehicles }, rows] = await Promise.all([
    vehicleQuery,
    listMaintenance({ organizationId, userId: context.user.id, scope: context.permission.scope, vehicleId, status, type, due, warningDays: settings.renewal_warning_days })
  ])

  const canChange = permissions.includes('fleet.maintenance')
  const selectedVehicle = vehicleId ? (vehicles || []).find((item: any) => item.id === vehicleId) : null

  return (
    <div className='flex flex-col gap-6'>
      <FleetPageHeader
        active='maintenance'
        permissions={permissions}
        title='Fleet'
        subtitle={selectedVehicle ? `Maintenance for ${vehicleDisplayName(selectedVehicle)}.` : 'Preventive maintenance, repairs and recalls across the fleet. Overdue items come first.'}
        actions={
          canChange ? (
            <Button asChild>
              <Link href={'/fleet/maintenance/new' + (vehicleId ? `?vehicle=${vehicleId}` : '')}>New Maintenance</Link>
            </Button>
          ) : null
        }
      />

      <form className='flex flex-wrap items-end gap-3' action='/fleet/maintenance'>
        <label className='flex flex-col gap-1 text-xs'>
          Vehicle
          <select name='vehicle' defaultValue={vehicleId || ''} className={SELECT} aria-label='Vehicle'>
            <option value=''>All vehicles</option>
            {(vehicles || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {vehicleDisplayName(item)}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs'>
          Status
          <select name='status' defaultValue={status} className={SELECT} aria-label='Status'>
            {MAINTENANCE_STATUSES.map(item => (
              <option key={item} value={item}>
                {MAINTENANCE_STATUS_LABELS[item]}
              </option>
            ))}
            <option value='all'>All</option>
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs'>
          Type
          <select name='type' defaultValue={type || ''} className={SELECT} aria-label='Type'>
            <option value=''>All types</option>
            {MAINTENANCE_TYPES.map(item => (
              <option key={item} value={item}>
                {MAINTENANCE_TYPE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs'>
          Due
          <select name='due' defaultValue={due || ''} className={SELECT} aria-label='Due'>
            <option value=''>Any</option>
            {MAINTENANCE_DUE_FILTERS.map(item => (
              <option key={item} value={item}>
                {MAINTENANCE_DUE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <Button type='submit' size='sm' variant='outline'>
          Filter
        </Button>
        {vehicleId || status !== 'open' || type || due ? (
          <Link className='text-primary text-sm hover:underline' href='/fleet/maintenance'>
            Clear filters
          </Link>
        ) : null}
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className='text-right'>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map(row => (
                <TableRow key={row.id} data-maintenance={row.maintenance_number} data-due-state={row.dueState}>
                  <TableCell>
                    <Link href={`/fleet/maintenance/${row.id}`} className='text-primary font-semibold hover:underline'>
                      {row.title}
                    </Link>
                    <div className='text-textSecondary text-xs'>
                      {row.maintenance_number}
                      {row.dvir ? ` · From DVIR ${row.dvir.dvir_number}` : ''}
                      {row.repeat_days || row.repeat_miles ? ' · Repeats' : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.vehicle ? (
                      <Link href={`/fleet/vehicles/${row.vehicle_id}`} className='hover:underline'>
                        {vehicleDisplayName(row.vehicle)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{MAINTENANCE_TYPE_LABELS[row.maintenance_type as MaintenanceType] || row.maintenance_type}</TableCell>
                  <TableCell>
                    <div>{[formatUsDate(row.due_on), row.due_mileage != null ? `${row.due_mileage.toLocaleString('en-US')} mi` : ''].filter(Boolean).join(' · ') || '—'}</div>
                    {row.status === 'open' ? <MaintenanceDueBadge state={row.dueState} /> : null}
                  </TableCell>
                  <TableCell>
                    {MAINTENANCE_STATUS_LABELS[row.status as keyof typeof MAINTENANCE_STATUS_LABELS] || row.status}
                    {row.completed_on ? <div className='text-textSecondary text-xs'>{formatUsDate(row.completed_on)}</div> : null}
                  </TableCell>
                  <TableCell>{row.vendor || '—'}</TableCell>
                  <TableCell className='text-right'>{centsToDollars(row.cost_cents) || '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className='py-10 text-center'>
                  No maintenance matches.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default MaintenancePage
