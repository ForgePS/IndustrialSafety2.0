import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import TruckStatusBadge, { TRUCK_STATUS_LABELS } from '@/components/forklifts/TruckStatusBadge'
import { formatWhen } from '@/components/permits/format'
import { companyLocations, companyTimeZone, forkliftRights, latestChecks, listDefects, listTrucks } from '@/lib/forgeForkliftAccess'
import { checkedToday, isTruckClass, TRUCK_CLASS_INFO, TRUCK_CLASSES, truckSummary } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklifts' }

/** Port slice 19: the truck register with search and class, status, location and "not checked today" filters. */
const TruckListPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const query = await searchParams
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '')
  const truckClass = isTruckClass(one('class')) ? one('class') : ''
  const status = one('status') in TRUCK_STATUS_LABELS ? one('status') : ''
  const locationId = one('location')
  const search = one('q').trim().toLowerCase()
  const unchecked = one('unchecked') === '1'

  const [all, locations, timeZone] = await Promise.all([listTrucks({ organizationId, rights, includeRetired: status === 'retired' }), companyLocations(organizationId), companyTimeZone(organizationId)])
  const ids = all.map(truck => truck.id)
  const [latest, defects] = await Promise.all([latestChecks(organizationId, ids), ids.length ? listDefects({ organizationId, forkliftIds: ids, openOnly: true }) : Promise.resolve([])])
  const names = new Map(locations.map(location => [location.id, location.name]))
  const openDefects = new Map<string, number>()

  for (const defect of defects) openDefects.set(defect.forklift_id, (openDefects.get(defect.forklift_id) || 0) + 1)

  const trucks = all.filter(
    truck =>
      (!truckClass || truck.truck_class === truckClass) &&
      (!status || truck.asset.status === status) &&
      (!locationId || truck.asset.location_id === locationId) &&
      (!unchecked || (truck.asset.status === 'active' && !checkedToday(latest.get(truck.id)?.performed_at, timeZone))) &&
      (!search ||
        [truck.asset.asset_number, truck.asset.name, truck.asset.serial_number, truck.asset.manufacturer, truck.asset.model].filter(Boolean).join(' ').toLowerCase().includes(search))
  )

  const field = 'bg-background rounded-md border px-3 py-2 text-sm'

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Trucks</h1>
          <p className='text-textSecondary mt-2'>Every forklift and powered industrial truck, its status and its last pre-shift check.</p>
        </div>
        {rights.manage ? (
          <Button asChild>
            <Link href='/forklifts/trucks/new' data-new-truck>
              Add forklift
            </Link>
          </Button>
        ) : null}
      </div>
      <ForkliftTabs active='trucks' canManage={Boolean(rights.manage)} />
      <form method='get' className='flex flex-wrap items-end gap-2' data-truck-filters>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Search
          <input name='q' defaultValue={one('q')} placeholder='Unit, name, serial, model' className={field} />
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Class
          <select name='class' defaultValue={truckClass} className={field}>
            <option value=''>All</option>
            {TRUCK_CLASSES.map(item => (
              <option key={item} value={item}>
                {TRUCK_CLASS_INFO[item].label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Status
          <select name='status' defaultValue={status} className={field}>
            <option value=''>In use (not retired)</option>
            {Object.entries(TRUCK_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Location
          <select name='location' defaultValue={locationId} className={field}>
            <option value=''>All</option>
            {locations.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className='flex items-center gap-2 pb-2 text-sm'>
          <input type='checkbox' name='unchecked' value='1' defaultChecked={unchecked} />
          Not checked today
        </label>
        <Button type='submit' variant='outline' size='sm'>
          Filter
        </Button>
      </form>
      {trucks.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-truck-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Forklift</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Last check</th>
                  <th className='px-4 py-2 font-semibold'>Status</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map(truck => {
                  const last = latest.get(truck.id)
                  const today = checkedToday(last?.performed_at, timeZone)
                  const open = openDefects.get(truck.id) || 0

                  return (
                    <tr key={truck.id} className='border-b last:border-0' data-truck-row={truck.asset.name}>
                      <td className='px-4 py-2'>
                        <Link href={'/forklifts/trucks/' + truck.id} className='text-primary font-medium hover:underline'>
                          {truck.asset.name}
                        </Link>
                        <span className='text-textSecondary text-xs'> {truck.asset.asset_number}</span>
                        <p className='text-textSecondary text-xs'>{truckSummary(truck)}</p>
                      </td>
                      <td className='px-4 py-2'>{names.get(truck.asset.location_id || '') || 'Unknown'}</td>
                      <td className='px-4 py-2 text-xs'>
                        {last ? (
                          <>
                            <span className={last.result === 'fail' ? 'text-error font-semibold' : ''}>{last.result === 'pass' ? 'Passed' : 'Failed'}</span> {formatWhen(last.performed_at, timeZone)}
                          </>
                        ) : (
                          <span className='text-textSecondary'>None in 14 days</span>
                        )}
                        {truck.asset.status === 'active' && !today ? (
                          <p className='text-warning font-semibold' data-not-checked-today>
                            Not checked today
                          </p>
                        ) : null}
                      </td>
                      <td className='px-4 py-2'>
                        <TruckStatusBadge status={truck.asset.status} />
                        {open ? <p className='text-error mt-1 text-xs'>{open} open defect{open === 1 ? '' : 's'}</p> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No forklifts match.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default TruckListPage
