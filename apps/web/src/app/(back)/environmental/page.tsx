import type { Metadata } from 'next'
import Link from 'next/link'
import { TbLeaf } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { environmentalTabs } from '@/components/environmental/fields'
import { envRights, listEvents, listObligations, listPermits, listShipments, todayIso } from '@/lib/forgeEnvironmental'
import { eventTypeLabel, exceptionDueOn, MANIFEST_STATE_LABELS, manifestState, obligationState, PERMIT_STATE_LABELS, permitState } from '@/lib/forgeEnvironmentalRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental Safety' }

const Section = ({ title, empty, children, count, dataKey }: { title: string; empty: string; children: React.ReactNode; count: number; dataKey: string }) => (
  <Card>
    <CardHeader>
      <CardTitle>
        {title} ({count})
      </CardTitle>
    </CardHeader>
    <CardContent>
      {count ? (
        <ul className='flex flex-col gap-2 text-sm' data-overview={dataKey}>
          {children}
        </ul>
      ) : (
        <p className='text-textSecondary text-sm'>{empty}</p>
      )}
    </CardContent>
  </Card>
)

/** Port slice 17: what needs attention across permits, obligations, events and waste shipments. */
const EnvironmentalPage = async () => {
  const context = (await tenantPermissionOrNull('environmental.view')) || (await requireTenantPermission('environmental.report'))
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const today = todayIso()

  const [permits, obligations, events, shipments] = await Promise.all([
    listPermits({ organizationId, rights }),
    listObligations({ organizationId, rights }),
    listEvents({ organizationId, rights, status: 'open' }),
    listShipments({ organizationId, rights })
  ])

  const due = obligations.filter((item: any) => ['overdue', 'due_soon'].includes(obligationState(item, today)))
  const permitAlerts = permits.filter((item: any) => ['expired', 'expiring'].includes(permitState(item, today)))
  const manifestAlerts = shipments.filter((item: any) => ['exception_overdue', 'follow_up'].includes(manifestState(item, today)))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbLeaf />
            Environmental Safety
          </h1>
          <p className='text-textSecondary mt-2'>Keep permits and their obligations current, record spills and other events, and track waste manifests until the signed copy is back.</p>
        </div>
        {rights.report ? (
          <Button asChild>
            <Link href='/environmental/events/new'>Report an event</Link>
          </Button>
        ) : null}
      </div>
      {rights.view ? <EmergencyTabs tabs={environmentalTabs} current='overview' label='Environmental Safety' /> : null}
      <div className='grid gap-6 lg:grid-cols-2'>
        <Section title='Obligations due' empty='Nothing due in the next two weeks.' count={due.length} dataKey='obligations'>
          {due.map((item: any) => (
            <li key={item.id}>
              <Link href={'/environmental/obligations/' + item.id} className='text-primary hover:underline'>
                {item.title}
              </Link>{' '}
              <span className={obligationState(item, today) === 'overdue' ? 'text-error font-semibold' : 'text-warning font-semibold'}>
                {obligationState(item, today) === 'overdue' ? 'overdue since' : 'due'} {item.next_due_on}
              </span>
            </li>
          ))}
        </Section>
        <Section title='Open events' empty='No open events.' count={events.length} dataKey='events'>
          {events.map((item: any) => (
            <li key={item.id}>
              <Link href={'/environmental/events/' + item.id} className='text-primary hover:underline'>
                {item.event_number}
              </Link>{' '}
              {eventTypeLabel(item.event_type)}
              {item.reportable && !item.agency_notified_at ? <span className='text-error font-semibold'> · agency notice not recorded</span> : null}
            </li>
          ))}
        </Section>
        <Section title='Permits expiring or expired' empty='No permits expire in the next 90 days.' count={permitAlerts.length} dataKey='permits'>
          {permitAlerts.map((item: any) => (
            <li key={item.id}>
              <Link href={'/environmental/permits/' + item.id} className='text-primary hover:underline'>
                {item.title}
              </Link>{' '}
              <span className='text-warning font-semibold'>
                {PERMIT_STATE_LABELS[permitState(item, today)]}: {item.expires_on}
              </span>
            </li>
          ))}
        </Section>
        <Section title='Manifests needing action' empty='Every shipped manifest is on track.' count={manifestAlerts.length} dataKey='manifests'>
          {manifestAlerts.map((item: any) => (
            <li key={item.id}>
              {item.manifest_number} shipped {item.shipped_on}:{' '}
              <span className='text-error font-semibold'>
                {MANIFEST_STATE_LABELS[manifestState(item, today)]} (exception report due {exceptionDueOn(item)})
              </span>
            </li>
          ))}
        </Section>
      </div>
    </div>
  )
}

export default EnvironmentalPage
