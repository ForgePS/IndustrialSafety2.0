import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { ExpiryBadge, FleetPageHeader, FleetPill, allowedKeys } from '@/components/fleet/MaintenanceBadges'
import { loadFleetSettings, ownPersonnelIds, vehicleScopeFilter } from '@/lib/forgeFleetAccess'
import { buildFleetDrivers } from '@/lib/forgeFleetMaintenanceRules'
import { REMOVED_STATUSES, expiryState, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { COMPANY_DRIVER_STATUS_LABELS, formatUsDate } from '@/lib/forgeDotRules'
import type { CompanyDriverStatus } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Fleet Drivers' }

const PERSON = 'id, first_name, last_name, preferred_name, employee_number, employment_status, archived_at'

/**
 * Port slice 11: who drives the fleet. Read-only: the DOT company-driver roster and active DOT driver files,
 * one row per person, with their license, medical card and MVR dates and the vehicles assigned to them.
 * DOT Compliance stays the place to edit drivers.
 *
 * Organization scope sees every driver; a narrower fleet.view scope sees the drivers of the vehicles it covers.
 */
const FleetDriversPage = async ({ searchParams }: { searchParams: Promise<{ vehicle?: string; expiring?: string }> }) => {
  const context = await requireTenantPermission('fleet.view')
  const organizationId = context.activeOrganization.id
  const permissions = allowedKeys(context)
  const filters = await searchParams
  const supabase = createServiceRoleClient() as any
  const scope = context.permission.scope
  const canOpenDot = permissions.includes('dot.view')

  const scopeFilter = await vehicleScopeFilter({ organizationId, userId: context.user.id, scope })

  let vehicleQuery = supabase
    .from('forge_fleet_vehicles')
    .select('id, vehicle_number, unit_number, year, make, model, status, assigned_driver_personnel_id')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .not('assigned_driver_personnel_id', 'is', null)
    .not('status', 'in', `(${REMOVED_STATUSES.join(',')})`)
    .order('vehicle_number')

  if (scopeFilter) vehicleQuery = vehicleQuery.or(scopeFilter)

  const [settings, { data: roster }, { data: files }, { data: vehicles }, own] = await Promise.all([
    loadFleetSettings(organizationId),
    supabase
      .from('forge_dot_company_drivers')
      .select(`id, personnel_id, driver_name, employee_number, status, license_expires_on, next_mvr_due_on, person:forge_personnel(${PERSON})`)
      .eq('organization_id', organizationId)
      .neq('status', 'removed'),
    supabase
      .from('forge_dot_driver_files')
      .select(`id, personnel_id, license_expires_on, medical_certificate_expires_on, mvr_expires_on, person:forge_personnel(${PERSON})`)
      .eq('organization_id', organizationId)
      .is('archived_at', null),
    vehicleQuery,
    scope === 'organization' ? Promise.resolve([] as string[]) : ownPersonnelIds(organizationId, context.user.id)
  ])

  const warningDays = settings.renewal_warning_days

  let drivers = buildFleetDrivers({
    roster: roster || [],
    files: files || [],
    vehicles: (vehicles || []).map((vehicle: any) => ({ id: vehicle.id, personnelId: vehicle.assigned_driver_personnel_id, name: vehicleDisplayName(vehicle) }))
  })

  if (scope !== 'organization') drivers = drivers.filter(driver => driver.vehicles.length || (driver.personnelId && own.includes(driver.personnelId)))

  const withStates = drivers.map(driver => ({
    ...driver,
    licenseState: expiryState(driver.licenseExpiresOn, warningDays),
    medicalState: expiryState(driver.medicalExpiresOn, warningDays),
    mvrState: expiryState(driver.mvrDueOn, warningDays)
  }))

  const attention = (state: string) => state === 'expired' || state === 'expiring'

  const shown = withStates.filter(
    driver => (!filters.vehicle || driver.vehicles.length > 0) && (!filters.expiring || attention(driver.licenseState) || attention(driver.medicalState))
  )

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()

    for (const [key, value] of Object.entries({ ...filters, ...patch })) if (value) next.set(key, value)

    return '/fleet/drivers' + (next.toString() ? '?' + next.toString() : '')
  }

  const date = (iso: string | null, state: ReturnType<typeof expiryState>) => (iso ? <ExpiryBadge state={state} label={formatUsDate(iso)} /> : <span className='text-textSecondary'>—</span>)

  return (
    <div className='flex flex-col gap-6'>
      <FleetPageHeader
        active='drivers'
        permissions={permissions}
        title='Fleet'
        subtitle='Company drivers and DOT-qualified drivers, with their credentials and assigned vehicles. Drivers are managed in DOT Compliance.'
      />

      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <Link href={link({ vehicle: filters.vehicle ? undefined : '1' })} className={'rounded-full border px-3 py-1 ' + (filters.vehicle ? 'border-primary text-primary' : 'text-textSecondary')}>
          Has a vehicle
        </Link>
        <Link href={link({ expiring: filters.expiring ? undefined : '1' })} className={'rounded-full border px-3 py-1 ' + (filters.expiring ? 'border-primary text-primary' : 'text-textSecondary')}>
          License or medical expiring
        </Link>
        <span className='text-textSecondary'>
          {shown.length} of {withStates.length} drivers · Expiring means within {warningDays} days.
        </span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Roster status</TableHead>
              <TableHead>License expires</TableHead>
              <TableHead>Medical card expires</TableHead>
              <TableHead>MVR due</TableHead>
              <TableHead>Vehicles</TableHead>
              {canOpenDot ? <TableHead className='text-right'>DOT records</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length ? (
              shown.map(driver => (
                <TableRow key={driver.key} data-fleet-driver={driver.name}>
                  <TableCell>
                    <div className='font-semibold'>{driver.name}</div>
                    <div className='text-textSecondary text-xs'>
                      {driver.employeeNumber ? '#' + driver.employeeNumber : ''}
                      {driver.driverFileId ? (driver.employeeNumber ? ' · ' : '') + 'DOT driver' : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    {driver.rosterStatus ? (
                      <FleetPill tone={driver.rosterStatus === 'on_insurance' ? 'ok' : driver.rosterStatus === 'pending_mvr' ? 'warning' : 'muted'}>
                        {COMPANY_DRIVER_STATUS_LABELS[driver.rosterStatus as CompanyDriverStatus] || driver.rosterStatus}
                      </FleetPill>
                    ) : (
                      <span className='text-textSecondary text-sm'>Not on roster</span>
                    )}
                  </TableCell>
                  <TableCell>{date(driver.licenseExpiresOn, driver.licenseState)}</TableCell>
                  <TableCell>{date(driver.medicalExpiresOn, driver.medicalState)}</TableCell>
                  <TableCell>{date(driver.mvrDueOn, driver.mvrState)}</TableCell>
                  <TableCell>
                    {driver.vehicles.length ? (
                      <div className='flex flex-col gap-0.5'>
                        {driver.vehicles.map(vehicle => (
                          <Link key={vehicle.id} href={`/fleet/vehicles/${vehicle.id}`} className='text-primary text-sm hover:underline' data-driver-vehicle={vehicle.id}>
                            {vehicle.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className='text-textSecondary text-sm'>None</span>
                    )}
                  </TableCell>
                  {canOpenDot ? (
                    <TableCell className='text-right'>
                      <div className='flex flex-col items-end gap-0.5 text-sm'>
                        {driver.companyDriverId ? (
                          <Link href={`/dot/company-drivers/${driver.companyDriverId}`} className='text-primary hover:underline'>
                            Company driver
                          </Link>
                        ) : null}
                        {driver.driverFileId ? (
                          <Link href={`/dot/drivers/${driver.driverFileId}`} className='text-primary hover:underline'>
                            Driver file
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={canOpenDot ? 7 : 6} className='py-10 text-center'>
                  No drivers match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default FleetDriversPage
