import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import IncidentLinksPanel from '@/components/forklifts/IncidentLinksPanel'
import { DefectCloseButton, TruckActionButtons } from '@/components/forklifts/TruckActionButtons'
import TruckStatusBadge from '@/components/forklifts/TruckStatusBadge'
import { Detail } from '@/components/permits/PermitDetails'
import { formatWhen } from '@/components/permits/format'
import { companyTimeZone, forkliftRights, latestStatusChanges, listChecks, listDefects, loadActivity, loadTruck, locationNames, rightsAt, userNameMap } from '@/lib/forgeForkliftAccess'
import { DEFECT_STATUS_LABELS, DESIGNATIONS, formatDate, nameplateWarning, TRUCK_CLASS_INFO, truckSummary } from '@/lib/forgeForkliftRules'
import type { TruckClass } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklift' }

const num = (value: unknown, unit: string) => (value === null || value === undefined ? '' : `${Number(value).toLocaleString('en-US')} ${unit}`)

/** Port slice 19: one forklift: its profile, status, open defects, recent checks and history. */
const TruckPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const truck = await loadTruck(organizationId, rights, id)

  if (!truck) notFound()

  const here = rightsAt(rights, truck.asset.location_id)
  const { asset } = truck

  const [timeZone, locations, defects, checks, activity, changes, meter] = await Promise.all([
    companyTimeZone(organizationId),
    locationNames(organizationId),
    listDefects({ organizationId, forkliftIds: [truck.id] }),
    listChecks({ organizationId, forkliftId: truck.id, limit: 20 }),
    loadActivity({ forkliftId: truck.id }),
    latestStatusChanges(organizationId, [truck.asset_id]),
    (createServiceRoleClient() as any)
      .from('forge_asset_meter_readings')
      .select('reading, recorded_at')
      .eq('organization_id', organizationId)
      .eq('asset_id', truck.asset_id)
      .eq('meter_type', 'hours')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  const users = await userNameMap([...activity.map(row => row.actor_user_id), ...defects.map(row => row.resolved_by)])
  const open = defects.filter(defect => defect.status === 'open').sort((a, b) => Number(b.critical) - Number(a.critical))
  const closed = defects.filter(defect => defect.status !== 'open').slice(0, 10)
  const openCritical = open.filter(defect => defect.critical).length
  const change = changes.get(truck.asset_id)
  const outOfService = asset.status === 'out_of_service'
  const warning = nameplateWarning(truck)

  return (
    <div className='flex flex-col gap-6' data-truck-page={asset.name}>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/forklifts/trucks' className='text-primary text-sm hover:underline'>
            ← Trucks
          </Link>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{asset.name}</h1>
            <TruckStatusBadge status={asset.status} />
          </div>
          <p className='text-textSecondary mt-2' data-truck-summary>
            {asset.asset_number} · {truckSummary(truck)}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {here.check && !asset.retired_at && asset.status !== 'retired' ? (
            <Button asChild>
              <Link href={`/forklifts/trucks/${truck.id}/check`} data-start-check>
                Start pre-shift check
              </Link>
            </Button>
          ) : null}
          <TruckActionButtons forkliftId={truck.id} status={asset.status} canManage={here.manage} canCheck={here.check} openCritical={openCritical} />
          {here.manage && !asset.retired_at ? (
            <Button asChild variant='outline'>
              <Link href={`/forklifts/trucks/${truck.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          <Button asChild variant='outline'>
            <Link href={'/assets/' + asset.id} data-asset-link>
              Equipment record
            </Link>
          </Button>
        </div>
      </div>
      <ForkliftTabs active='trucks' canManage={Boolean(rights.manage)} />

      {outOfService ? (
        <div className='border-error bg-error/10 text-error rounded-md border-2 p-4' data-out-of-service-banner>
          <p className='text-lg font-bold'>OUT OF SERVICE. Do not use this forklift.</p>
          {change?.to_status === 'out_of_service' ? (
            <p className='mt-1 text-sm' data-out-of-service-reason>
              {change.reason || 'No reason given'}
              {change.notes ? `: ${change.notes}` : ''} · {change.actor_name || users.get(change.actor_user_id || '') || ''} {formatWhen(change.changed_at, timeZone)}
            </p>
          ) : null}
          {openCritical ? <p className='mt-1 text-sm'>Close the open critical defects as repaired before returning it to service.</p> : null}
        </div>
      ) : null}
      {warning ? (
        <p className='border-warning text-warning rounded-md border p-3 text-sm' data-nameplate-warning>
          {warning}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Truck</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Class'>{TRUCK_CLASS_INFO[truck.truck_class as TruckClass] ? `${TRUCK_CLASS_INFO[truck.truck_class as TruckClass].label}: ${TRUCK_CLASS_INFO[truck.truck_class as TruckClass].description}` : truck.truck_class}</Detail>
            <Detail label='Location'>{locations.get(asset.location_id || '') || ''}</Detail>
            <Detail label='Hour meter'>{meter.data ? `${num(meter.data.reading, 'hours')} (${formatWhen(meter.data.recorded_at, timeZone)})` : ''}</Detail>
            <Detail label='Rated capacity'>{num(truck.rated_capacity_lb, 'lb')}</Detail>
            <Detail label='Load center'>{num(truck.load_center_in, 'in')}</Detail>
            <Detail label='Maximum lift height'>{num(truck.max_lift_height_in, 'in')}</Detail>
            <Detail label='Attachments'>{truck.attachments || ''}</Detail>
            <Detail label='Nameplate checked'>{formatDate(truck.nameplate_verified_on)}</Detail>
            <Detail label='Type designation'>{truck.designation ? DESIGNATIONS[truck.designation] || truck.designation : ''}</Detail>
            <Detail label='Manufacturer'>{asset.manufacturer || ''}</Detail>
            <Detail label='Model'>{asset.model || ''}</Detail>
            <Detail label='Serial number'>{asset.serial_number || ''}</Detail>
          </dl>
          {truck.notes ? <p className='mt-4 whitespace-pre-wrap text-sm'>{truck.notes}</p> : null}
        </CardContent>
      </Card>

      <Card data-open-defects>
        <CardHeader>
          <CardTitle>Open defects</CardTitle>
        </CardHeader>
        <CardContent>
          {open.length ? (
            <ul className='flex flex-col gap-3 text-sm'>
              {open.map(defect => (
                <li key={defect.id} className='flex flex-wrap items-start justify-between gap-2' data-defect-row={defect.item_label}>
                  <span>
                    {defect.critical ? (
                      <Badge size='sm' variant='destructive' className='mr-2'>
                        Critical
                      </Badge>
                    ) : null}
                    <span className='font-medium'>{defect.item_label}</span>: {defect.description}
                    <span className='text-textSecondary block text-xs'>
                      {defect.reported_by_name ? defect.reported_by_name + ', ' : ''}
                      {formatWhen(defect.reported_at, timeZone)}
                    </span>
                  </span>
                  {here.manage ? <DefectCloseButton defectId={defect.id} label={defect.item_label} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No open defects.</p>
          )}
          {closed.length ? (
            <details className='mt-4 text-sm'>
              <summary className='cursor-pointer font-medium'>Recently closed</summary>
              <ul className='mt-2 flex flex-col gap-1' data-closed-defects>
                {closed.map(defect => (
                  <li key={defect.id} data-closed-defect={defect.item_label}>
                    <span className='font-medium'>{defect.item_label}</span>: {DEFECT_STATUS_LABELS[defect.status] || defect.status}, {users.get(defect.resolved_by) || ''} {formatWhen(defect.resolved_at, timeZone)}
                    {defect.resolution_note ? ` (${defect.resolution_note})` : ''}
                    {defect.maintenance_id ? (
                      <Link href={`/assets/${asset.id}`} className='text-primary ml-1 hover:underline' data-defect-maintenance>
                        recorded as maintenance
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent pre-shift checks</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto p-0'>
          {checks.length ? (
            <table className='w-full border-collapse text-sm' data-truck-checks>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>When</th>
                  <th className='px-4 py-2 font-semibold'>Operator</th>
                  <th className='px-4 py-2 font-semibold'>Hours</th>
                  <th className='px-4 py-2 font-semibold'>Result</th>
                </tr>
              </thead>
              <tbody>
                {checks.map(check => (
                  <tr key={check.id} className='border-b last:border-0' data-check-row={check.result}>
                    <td className='px-4 py-2'>
                      <Link href={'/forklifts/checks/' + check.id} className='text-primary hover:underline'>
                        {formatWhen(check.performed_at, timeZone)}
                      </Link>
                    </td>
                    <td className='px-4 py-2'>{check.operator_name}</td>
                    <td className='px-4 py-2'>{check.hour_meter === null ? '' : Number(check.hour_meter).toLocaleString('en-US')}</td>
                    <td className='px-4 py-2'>
                      <span className={check.result === 'fail' ? 'text-error font-semibold' : ''}>{check.result === 'pass' ? 'Passed' : 'Failed'}</span>
                      {check.took_out_of_service ? <span className='text-error text-xs'> · taken out of service</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary p-4 text-sm'>No checks yet.</p>
          )}
        </CardContent>
      </Card>

      <IncidentLinksPanel organizationId={organizationId} forkliftId={truck.id} canManage={here.manage} />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length ? (
            <ul className='flex flex-col gap-1 text-sm' data-truck-history>
              {activity.map(row => (
                <li key={row.id}>
                  <span className='text-textSecondary'>{formatWhen(row.created_at, timeZone)}</span> · {row.actor_name || users.get(row.actor_user_id) || 'System'} · {row.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>Nothing yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TruckPage
