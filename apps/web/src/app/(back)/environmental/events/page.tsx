import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { environmentalTabs } from '@/components/environmental/fields'
import { companyLocations, envRights, listEvents } from '@/lib/forgeEnvironmental'
import { eventTypeLabel } from '@/lib/forgeEnvironmentalRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental events' }

/** Port slice 17: spills, releases, exceedances, complaints and notices of violation. */
const EventsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = (await tenantPermissionOrNull('environmental.view')) || (await requireTenantPermission('environmental.report'))
  const organizationId = context.activeOrganization.id
  const query = await searchParams
  const status = query.status === 'open' || query.status === 'closed' ? query.status : ''
  const rights = await envRights(organizationId, context.user.id, context.access)
  const [events, locations] = await Promise.all([listEvents({ organizationId, rights, status: status || undefined }), companyLocations(organizationId)])
  const names = new Map(locations.map(location => [location.id, location.name]))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>Environmental events</h1>
        {rights.report ? (
          <Button asChild>
            <Link href='/environmental/events/new'>Report an event</Link>
          </Button>
        ) : null}
      </div>
      {rights.view ? <EmergencyTabs tabs={environmentalTabs} current='events' label='Environmental Safety' /> : null}
      <nav aria-label='Filter by status' className='flex gap-2 text-sm'>
        {[
          ['', 'All'],
          ['open', 'Open'],
          ['closed', 'Closed']
        ].map(([key, label]) => (
          <Link
            key={key || 'all'}
            href={'/environmental/events' + (key ? '?status=' + key : '')}
            aria-current={status === key ? 'page' : undefined}
            className={'rounded-full border px-3 py-1 ' + (status === key ? 'border-primary text-primary' : 'text-textSecondary')}
          >
            {label}
          </Link>
        ))}
      </nav>
      {events.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-event-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Event</th>
                  <th className='px-4 py-2 font-semibold'>When</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Reportable</th>
                  <th className='px-4 py-2 font-semibold'>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event: any) => (
                  <tr key={event.id} className='border-b last:border-0' data-event={event.event_number}>
                    <td className='px-4 py-2'>
                      <Link href={'/environmental/events/' + event.id} className='text-primary font-medium hover:underline'>
                        {event.event_number}
                      </Link>
                      <p>
                        {eventTypeLabel(event.event_type)}
                        {event.substance ? ` · ${event.substance}` : ''}
                      </p>
                    </td>
                    <td className='px-4 py-2'>{new Date(event.occurred_at).toLocaleString('en-US')}</td>
                    <td className='px-4 py-2'>{names.get(event.location_id) || 'Unknown'}</td>
                    <td className='px-4 py-2'>{event.reportable ? (event.agency_notified_at ? 'Yes, agency told' : <span className='text-error font-semibold'>Yes, notice not recorded</span>) : 'No'}</td>
                    <td className='px-4 py-2'>{event.status === 'closed' ? 'Closed' : 'Open'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No environmental events.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default EventsPage
