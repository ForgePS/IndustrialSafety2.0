import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { AreaStatusDot } from '@/components/waypoint/AreaBriefing'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  listAreas,
  loadAreaLocations,
  loadAreaSignals,
  statusForArea,
  waypointGrant,
  waypointLocationIds,
  type WaypointContext
} from '@/lib/forgeWaypoint'

export const metadata: Metadata = { title: 'Waypoint' }

const selectClass = 'border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'

/** Forge Waypoint: every area in the user's scope with its live status light. */
const WaypointPage = async ({
  searchParams
}: {
  searchParams: Promise<{ location?: string; q?: string; archived?: string }>
}) => {
  const context = (await requireTenantPermission('waypoint.view')) as unknown as WaypointContext & {
    activeOrganization: { id: string; name: string }
  }
  const organizationId = context.activeOrganization.id
  const query = await searchParams
  const archived = query.archived === '1'
  const locationIds = await waypointLocationIds(context, 'waypoint.view')
  const locations = await loadAreaLocations(organizationId, locationIds)
  const locationId =
    query.location && locations.some(location => location.id === query.location) ? query.location : null
  const areas = await listAreas({
    organizationId,
    locationIds,
    locationId,
    archived,
    search: String(query.q || '').slice(0, 80)
  })
  const canManage = Boolean(waypointGrant(context, 'waypoint.manage'))

  const [signals, { data: qrRows }] = await Promise.all([
    archived ? Promise.resolve(new Map()) : loadAreaSignals(organizationId, areas),
    areas.length
      ? (createServiceRoleClient() as any)
          .from('forge_qr_codes')
          .select('target_id')
          .eq('organization_id', organizationId)
          .eq('target_type', 'area')
          .is('archived_at', null)
          .in(
            'target_id',
            areas.map(area => area.id)
          )
      : Promise.resolve({ data: [] })
  ])

  const qrCount = new Map<string, number>()

  for (const row of (qrRows || []) as { target_id: string }[])
    qrCount.set(row.target_id, (qrCount.get(row.target_id) || 0) + 1)

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Waypoint
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Waypoint</h1>
          <p className='text-textSecondary mt-2 max-w-2xl'>
            Every area of your facilities and what to know before you walk in. Post an Area Card QR at the entrance:
            scanning it shows the status light, required PPE, hazards, equipment and emergency information.
          </p>
        </div>
        {canManage && !archived ? (
          <Button asChild>
            <Link href='/waypoint/new'>New area</Link>
          </Button>
        ) : null}
      </div>

      <form className='flex flex-wrap items-center gap-3' action='/waypoint'>
        <select name='location' defaultValue={locationId || ''} className={selectClass} aria-label='Location'>
          <option value=''>All locations</option>
          {locations.map(location => (
            <option key={location.id} value={location.id}>
              {location.label}
            </option>
          ))}
        </select>
        <input
          name='q'
          defaultValue={query.q || ''}
          placeholder='Search areas'
          className={selectClass}
          aria-label='Search areas'
        />
        {archived ? <input type='hidden' name='archived' value='1' /> : null}
        <Button type='submit' variant='outline'>
          Filter
        </Button>
        <Link className='text-primary text-sm hover:underline' href={archived ? '/waypoint' : '/waypoint?archived=1'}>
          {archived ? 'Back to active areas' : 'Archived areas'}
        </Link>
      </form>

      <Card>
        <CardContent className='p-0'>
          {areas.length ? (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm' data-testid='waypoint-areas'>
                <thead>
                  <tr className='text-textSecondary border-b text-left'>
                    <th className='p-3'>Area</th>
                    <th className='p-3'>Location</th>
                    {archived ? <th className='p-3'>Archived</th> : <th className='p-3'>Status</th>}
                    <th className='p-3'>PPE</th>
                    <th className='p-3'>Equipment</th>
                    <th className='p-3'>Area Cards</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map(area => {
                    const areaSignals = signals.get(area.id)
                    const status = statusForArea(areaSignals, area)

                    return (
                      <tr key={area.id} className='border-b last:border-0' data-area-row={area.id}>
                        <td className='p-3'>
                          <Link href={'/waypoint/' + area.id} className='text-primary font-semibold hover:underline'>
                            {area.name}
                          </Link>
                          {area.code ? <span className='text-textSecondary'> · {area.code}</span> : null}
                        </td>
                        <td className='p-3'>{area.location_name || '—'}</td>
                        <td className='p-3'>
                          {archived ? (
                            area.archived_at ? (
                              new Date(area.archived_at).toLocaleDateString()
                            ) : (
                              '—'
                            )
                          ) : (
                            <AreaStatusDot level={status.level} label={status.label} />
                          )}
                        </td>
                        <td className='p-3'>{area.required_ppe.length}</td>
                        <td className='p-3'>{archived ? '—' : areaSignals?.equipment.length || 0}</td>
                        <td className='p-3'>{qrCount.get(area.id) || 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className='p-6 text-sm'>
              <p className='text-textPrimary font-semibold'>{archived ? 'No archived areas.' : 'No areas yet.'}</p>
              {!archived ? (
                <p className='text-textSecondary mt-1'>
                  {canManage
                    ? 'Create an area for each part of a location people walk into: a booth, a bay, a storage room.'
                    : 'Ask a safety manager to set up areas.'}
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default WaypointPage
