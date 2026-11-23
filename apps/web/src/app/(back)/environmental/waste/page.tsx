import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { environmentalTabs } from '@/components/environmental/fields'
import { companyLocations, covers, envRights, listShipments, todayIso } from '@/lib/forgeEnvironmental'
import { exceptionDueOn, generatorLabel, MANIFEST_STATE_LABELS, manifestState } from '@/lib/forgeEnvironmentalRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Hazardous waste shipments' }

const ALERT = new Set(['exception_overdue', 'follow_up'])

/** Port slice 17: hazardous waste shipments, tracked until the signed manifest copy comes back. */
const WastePage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('environmental.view')
  const organizationId = context.activeOrganization.id
  const archived = (await searchParams).archived === '1'
  const rights = await envRights(organizationId, context.user.id, context.access)
  const [shipments, locations] = await Promise.all([listShipments({ organizationId, rights, archived }), companyLocations(organizationId)])
  const names = new Map(locations.map(location => [location.id, location.name]))
  const today = todayIso()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Hazardous waste shipments</h1>
          <p className='text-textSecondary mt-2'>
            Large quantity generators follow up after 35 days and file an exception report by day 45; small quantity generators file one after 60 days.
          </p>
        </div>
        {rights.manage && !archived ? (
          <Button asChild>
            <Link href='/environmental/waste/new'>Record shipment</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={environmentalTabs} current='waste' label='Environmental Safety' />
      <nav className='flex gap-2 text-sm'>
        <Link href='/environmental/waste' aria-current={archived ? undefined : 'page'} className={'rounded-full border px-3 py-1 ' + (archived ? 'text-textSecondary' : 'border-primary text-primary')}>
          Current
        </Link>
        <Link href='/environmental/waste?archived=1' aria-current={archived ? 'page' : undefined} className={'rounded-full border px-3 py-1 ' + (archived ? 'border-primary text-primary' : 'text-textSecondary')}>
          Archived
        </Link>
      </nav>
      {shipments.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-shipment-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Manifest</th>
                  <th className='px-4 py-2 font-semibold'>Shipped</th>
                  <th className='px-4 py-2 font-semibold'>Waste</th>
                  <th className='px-4 py-2 font-semibold'>From</th>
                  <th className='px-4 py-2 font-semibold'>Signed copy</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment: any) => {
                  const state = manifestState(shipment, today)
                  const due = exceptionDueOn(shipment)

                  return (
                    <tr key={shipment.id} className='border-b last:border-0' data-shipment={shipment.manifest_number}>
                      <td className='px-4 py-2'>
                        {covers(rights.manage, shipment.location_id) ? (
                          <Link href={'/environmental/waste/' + shipment.id + '/edit'} className='text-primary font-medium hover:underline'>
                            {shipment.manifest_number}
                          </Link>
                        ) : (
                          shipment.manifest_number
                        )}
                        <p className='text-textSecondary text-xs'>{generatorLabel(shipment.generator_status)}</p>
                      </td>
                      <td className='px-4 py-2'>{shipment.shipped_on}</td>
                      <td className='px-4 py-2'>
                        {shipment.waste_description} · {shipment.quantity} {shipment.unit}
                        {shipment.waste_codes?.length ? <p className='text-textSecondary text-xs'>{shipment.waste_codes.join(', ')}</p> : null}
                      </td>
                      <td className='px-4 py-2'>{names.get(shipment.location_id) || 'Unknown'}</td>
                      <td className={'px-4 py-2 ' + (ALERT.has(state) ? 'text-error font-semibold' : '')} data-manifest-state={state}>
                        {MANIFEST_STATE_LABELS[state]}
                        {state === 'received' ? ` ${shipment.return_received_on}` : null}
                        {due && (state === 'waiting' || ALERT.has(state)) ? <p className='text-xs font-normal'>Exception report due {due}</p> : null}
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
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{archived ? 'Nothing is archived.' : 'No shipments recorded yet.'}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default WastePage
