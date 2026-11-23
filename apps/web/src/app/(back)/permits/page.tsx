import type { Metadata } from 'next'
import Link from 'next/link'
import { TbAlertTriangle } from 'react-icons/tb'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import PermitTabs from '@/components/permits/PermitTabs'
import { formatWhen, timeLeftLabel } from '@/components/permits/format'
import { companyLocations, companyTimeZone, covers, listPermits, listSpaces, permitRights, personNames, viewGrant } from '@/lib/forgePermitAccess'
import { inChunks } from '@/lib/forgeFetchAll'
import type { PermitType } from '@/lib/forgePermitRules'
import { isExpired, minutesLeft, PERMIT_TYPE_INFO, PERMIT_TYPES, permitPath, personLabel } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Work Permits' }

const db = () => createServiceRoleClient() as any

const Section = ({ title, empty, children, count, name }: { title: string; empty: string; children: React.ReactNode; count: number; name: string }) => (
  <Card data-board-section={name}>
    <CardHeader>
      <CardTitle className='text-lg'>
        {title} <span className='text-textSecondary text-sm font-normal'>({count})</span>
      </CardTitle>
    </CardHeader>
    <CardContent>{count ? <ul className='flex flex-col gap-2 text-sm'>{children}</ul> : <p className='text-textSecondary text-sm'>{empty}</p>}</CardContent>
  </Card>
)

/** Port slice 18: every open permit at a glance, and who is inside a confined space right now. */
const PermitBoardPage = async () => {
  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const rights = await permitRights(organizationId, userId, context.access)
  const grant = viewGrant(rights)

  const [open, locations, timeZone, spaces] = await Promise.all([
    listPermits({ organizationId, rights, open: true }),
    companyLocations(organizationId),
    companyTimeZone(organizationId),
    grant ? listSpaces({ organizationId, grant, includeArchived: true }) : Promise.resolve([])
  ])

  const now = new Date()
  const permits = open as any[]
  const byId = new Map(permits.map(permit => [permit.id, permit]))
  const locationName = new Map(locations.map(location => [location.id, location.name]))
  const spaceName = new Map((spaces as any[]).map(space => [space.id, space.name]))

  const waiting = permits.filter(permit => permit.status === 'requested' && covers(rights.approve, permit.location_id))
  const active = permits.filter(permit => permit.status === 'active' && !isExpired(permit, now))
  const suspended = permits.filter(permit => permit.status === 'suspended')
  const expired = permits.filter(permit => isExpired(permit, now))

  // Suspension reasons and who is inside a confined space now (only for permits the person can see).
  const reasons = new Map<string, string>()
  const inside: { id: string; permitId: string; personId: string; enteredAt: string }[] = []

  for (const chunk of inChunks(suspended.map(permit => permit.id))) {
    const { data } = await db().from('forge_permits').select('id, suspend_reason').eq('organization_id', organizationId).in('id', chunk)

    for (const row of (data || []) as any[]) reasons.set(row.id, row.suspend_reason)
  }

  const spacePermits = permits.filter(permit => permit.permit_type === 'confined_space' && ['active', 'suspended'].includes(permit.status)).map(permit => permit.id)

  for (const chunk of inChunks(spacePermits)) {
    const { data } = await db().from('forge_permit_entries').select('id, permit_id, person_id, entered_at').eq('organization_id', organizationId).in('permit_id', chunk).is('exited_at', null)

    for (const row of (data || []) as any[]) inside.push({ id: row.id, permitId: row.permit_id, personId: row.person_id, enteredAt: row.entered_at })
  }

  const insidePeople: any[] = []

  for (const chunk of inChunks(inside.map(entry => entry.personId))) {
    const { data } = await db().from('forge_permit_people').select('id, role, personnel_id, contractor_worker_id').in('id', chunk)

    insidePeople.push(...((data || []) as any[]))
  }

  const names = await personNames(insidePeople)
  const insideName = new Map(insidePeople.map(person => [person.id, personLabel(person, names.personnel, names.workers)]))

  const counts = PERMIT_TYPES.map(type => ({
    type,
    open: permits.filter(permit => permit.permit_type === type && permit.status !== 'draft').length,
    active: permits.filter(permit => permit.permit_type === type && permit.status === 'active').length
  }))

  const row = (permit: any, extra?: React.ReactNode) => (
    <li key={permit.id} className='flex flex-wrap items-baseline justify-between gap-2' data-board-permit={permit.permit_number}>
      <span>
        <Link href={permitPath(permit.permit_type as PermitType, permit.id)} className='text-primary font-medium hover:underline'>
          {permit.permit_number}
        </Link>{' '}
        {permit.title}
        <span className='text-textSecondary'> · {locationName.get(permit.location_id) || 'Unknown location'}</span>
      </span>
      {extra}
    </li>
  )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbAlertTriangle />
          Work Permits
        </h1>
        <p className='text-textSecondary mt-2'>Confined space, hot work, working at heights and energized electrical work permits: what is waiting, live, stopped or overdue.</p>
      </div>
      <PermitTabs active='board' canManage={Boolean(rights.manage)} />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4' data-board-counts>
        {counts.map(item => (
          <Link key={item.type} href={permitPath(item.type)} className='hover:border-primary rounded-md border p-4' data-board-count={item.type}>
            <p className='text-sm font-semibold'>{PERMIT_TYPE_INFO[item.type].short}</p>
            <p className='text-2xl font-bold'>{item.active}</p>
            <p className='text-textSecondary text-xs'>
              active · {item.open} open (not draft)
            </p>
          </Link>
        ))}
      </div>

      <Section title='People inside confined spaces now' empty='No one is inside a confined space.' count={inside.length} name='inside'>
        {inside.map(entry => {
          const permit = byId.get(entry.permitId)

          return (
            <li key={entry.id} className='flex flex-wrap items-baseline justify-between gap-2' data-inside-person={insideName.get(entry.personId) || ''}>
              <span>
                <span className='font-medium'>{insideName.get(entry.personId) || 'Unknown'}</span> in {spaceName.get(permit?.space_id) || 'a space'} on{' '}
                <Link href={permitPath('confined_space', entry.permitId)} className='text-primary hover:underline'>
                  {permit?.permit_number}
                </Link>
              </span>
              <span className='text-textSecondary text-xs'>since {formatWhen(entry.enteredAt, timeZone)}</span>
            </li>
          )
        })}
      </Section>

      {rights.approve ? (
        <Section title='Waiting for approval' empty='Nothing is waiting for approval.' count={waiting.length} name='waiting'>
          {waiting.map(permit => row(permit, permit.requested_by === userId ? <span className='text-textSecondary text-xs'>your request</span> : null))}
        </Section>
      ) : null}

      <Section title='Active now' empty='No active permits.' count={active.length} name='active'>
        {active.map(permit => {
          const left = minutesLeft(permit, now) ?? 0

          return row(
            permit,
            <span className={'text-xs ' + (left < 60 ? 'text-error font-semibold' : 'text-textSecondary')} data-time-left>
              {timeLeftLabel(left)}
            </span>
          )
        })}
      </Section>

      <Section title='Suspended' empty='No suspended permits.' count={suspended.length} name='suspended'>
        {suspended.map(permit => row(permit, <span className='text-error text-xs'>{reasons.get(permit.id) || ''}</span>))}
      </Section>

      <Section title='Past their end time but still open' empty='None.' count={expired.length} name='expired'>
        {expired.map(permit =>
          row(
            permit,
            <span className='text-error text-xs font-semibold' data-time-left>
              {timeLeftLabel(minutesLeft(permit, now))}
            </span>
          )
        )}
      </Section>
    </div>
  )
}

export default PermitBoardPage
