import type { Metadata } from 'next'
import Link from 'next/link'
import { TbForklift } from 'react-icons/tb'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import OperatorSummaryCard from '@/components/forklifts/OperatorSummaryCard'
import { formatWhen } from '@/components/permits/format'
import { companyTimeZone, forkliftRights, latestChecks, latestStatusChanges, listDefects, listTrucks, locationNames } from '@/lib/forgeForkliftAccess'
import { checkedToday } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklifts' }

const Section = ({ title, empty, children, count, name }: { title: string; empty: string; children: React.ReactNode; count: number; name: string }) => (
  <Card data-overview-section={name}>
    <CardHeader>
      <CardTitle className='text-lg'>
        {title} <span className='text-textSecondary text-sm font-normal'>({count})</span>
      </CardTitle>
    </CardHeader>
    <CardContent>{count ? <ul className='flex flex-col gap-2 text-sm'>{children}</ul> : <p className='text-textSecondary text-sm'>{empty}</p>}</CardContent>
  </Card>
)

/** Port slice 19: the fleet at a glance: what is out of service and why, what hasn't been checked today, open defects. */
const ForkliftOverviewPage = async () => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)

  const [trucks, timeZone, locations] = await Promise.all([listTrucks({ organizationId, rights }), companyTimeZone(organizationId), locationNames(organizationId)])
  const ids = trucks.map(truck => truck.id)

  const [latest, defects, changes] = await Promise.all([
    latestChecks(organizationId, ids),
    ids.length ? listDefects({ organizationId, forkliftIds: ids, openOnly: true }) : Promise.resolve([]),
    latestStatusChanges(
      organizationId,
      trucks.filter(truck => truck.asset.status === 'out_of_service').map(truck => truck.asset_id)
    )
  ])

  const byId = new Map(trucks.map(truck => [truck.id, truck]))
  const inService = trucks.filter(truck => truck.asset.status === 'active')
  const outOfService = trucks.filter(truck => truck.asset.status === 'out_of_service')
  const notChecked = inService.filter(truck => !checkedToday(latest.get(truck.id)?.performed_at, timeZone))
  const critical = defects.filter(defect => defect.critical)

  const label = (truck: (typeof trucks)[number]) => (
    <>
      <Link href={'/forklifts/trucks/' + truck.id} className='text-primary font-medium hover:underline'>
        {truck.asset.name}
      </Link>{' '}
      <span className='text-textSecondary'>
        {truck.asset.asset_number} · {locations.get(truck.asset.location_id || '') || 'No location'}
      </span>
    </>
  )

  const counts = [
    { key: 'in-service', label: 'In service', value: inService.length, href: '/forklifts/trucks?status=active' },
    { key: 'out-of-service', label: 'Out of service', value: outOfService.length, href: '/forklifts/trucks?status=out_of_service', alert: outOfService.length > 0 },
    { key: 'not-checked', label: 'Not checked today', value: notChecked.length, href: '/forklifts/trucks?unchecked=1', alert: notChecked.length > 0 },
    { key: 'defects', label: 'Open defects', value: defects.length, extra: `${critical.length} critical`, href: '/forklifts/defects', alert: critical.length > 0 }
  ]

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbForklift />
          Forklifts
        </h1>
        <p className='text-textSecondary mt-2'>Powered industrial trucks: pre-shift checks, defects, out of service and operator authorizations (OSHA 1910.178).</p>
      </div>
      <ForkliftTabs active='overview' canManage={Boolean(rights.manage)} />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4' data-overview-counts>
        {counts.map(item => (
          <Link key={item.key} href={item.href} className='hover:border-primary rounded-md border p-4' data-overview-count={item.key}>
            <p className='text-sm font-semibold'>{item.label}</p>
            <p className={'text-2xl font-bold' + (item.alert ? ' text-error' : '')} data-count-value>
              {item.value}
            </p>
            {item.extra ? <p className='text-textSecondary text-xs'>{item.extra}</p> : null}
          </Link>
        ))}
      </div>

      <Section title='Out of service' empty='Every forklift is in service.' count={outOfService.length} name='out-of-service'>
        {outOfService.map(truck => {
          const change = changes.get(truck.asset_id)

          return (
            <li key={truck.id} className='flex flex-wrap items-baseline justify-between gap-2' data-overview-truck={truck.asset.name}>
              <span>{label(truck)}</span>
              <span className='text-error text-xs'>
                {change?.to_status === 'out_of_service' ? `${change.reason || 'No reason given'} · ${formatWhen(change.changed_at, timeZone)}` : 'Out of service'}
              </span>
            </li>
          )
        })}
      </Section>

      <Section title='Not checked today' empty='Every forklift in service has been checked today.' count={notChecked.length} name='not-checked'>
        {notChecked.map(truck => {
          const last = latest.get(truck.id)

          return (
            <li key={truck.id} className='flex flex-wrap items-baseline justify-between gap-2' data-overview-truck={truck.asset.name}>
              <span>{label(truck)}</span>
              <span className='text-textSecondary text-xs'>{last ? `Last check ${formatWhen(last.performed_at, timeZone)}` : 'No check in the last 14 days'}</span>
            </li>
          )
        })}
      </Section>

      <Section title='Open critical defects' empty='No open critical defects.' count={critical.length} name='critical-defects'>
        {critical.map(defect => {
          const truck = byId.get(defect.forklift_id)

          return (
            <li key={defect.id} className='flex flex-wrap items-baseline justify-between gap-2' data-overview-defect={defect.item_label}>
              <span>
                <span className='font-medium'>{defect.item_label}</span>: {defect.description}
                {truck ? <> · {label(truck)}</> : null}
              </span>
              <span className='text-textSecondary text-xs'>
                {defect.reported_by_name ? defect.reported_by_name + ', ' : ''}
                {formatWhen(defect.reported_at, timeZone)}
              </span>
            </li>
          )
        })}
      </Section>

      <OperatorSummaryCard organizationId={organizationId} rights={rights} />
    </div>
  )
}

export default ForkliftOverviewPage
