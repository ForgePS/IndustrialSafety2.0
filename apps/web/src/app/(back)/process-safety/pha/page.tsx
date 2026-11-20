import type { Metadata } from 'next'
import Link from 'next/link'
import { TbFlask } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { processSafetyTabs } from '@/components/process-safety/tabs'
import { companyLocations, listPhas, psmRights, todayIso } from '@/lib/forgeProcessSafety'
import { phaMethodLabel, phaStatusLabel, revalidationState } from '@/lib/forgeProcessSafetyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Process hazard analyses' }

const STATE_TEXT = { overdue: 'Overdue', due_soon: 'Due soon', ok: '', none: '' } as const

/** Port slice 16: the register of process hazard analyses with revalidation due dates. */
const PhaListPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('process_safety.view')
  const organizationId = context.activeOrganization.id
  const archived = (await searchParams).archived === '1'
  const rights = await psmRights(organizationId, context.user.id, context.access)
  const [phas, locations] = await Promise.all([listPhas({ organizationId, rights, includeArchived: archived }), companyLocations(organizationId)])
  const names = new Map(locations.map(location => [location.id, location.name]))
  const today = todayIso()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbFlask />
            Process Safety
          </h1>
          <p className='text-textSecondary mt-2'>Process hazard analyses must be revalidated at least every five years.</p>
        </div>
        {rights.manage && !archived ? (
          <Button asChild>
            <Link href='/process-safety/pha/new'>Record a study</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={processSafetyTabs} current='pha' label='Process Safety' />
      <nav className='flex gap-2 text-sm'>
        <Link href='/process-safety/pha' aria-current={archived ? undefined : 'page'} className={'rounded-full border px-3 py-1 ' + (archived ? 'text-textSecondary' : 'border-primary text-primary')}>
          Current
        </Link>
        <Link href='/process-safety/pha?archived=1' aria-current={archived ? 'page' : undefined} className={'rounded-full border px-3 py-1 ' + (archived ? 'border-primary text-primary' : 'text-textSecondary')}>
          Archived
        </Link>
      </nav>
      {phas.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-pha-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Study</th>
                  <th className='px-4 py-2 font-semibold'>Method</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Status</th>
                  <th className='px-4 py-2 font-semibold'>Revalidate by</th>
                </tr>
              </thead>
              <tbody>
                {phas.map((pha: any) => {
                  const state = revalidationState(pha.revalidate_by, today)

                  return (
                    <tr key={pha.id} className='border-b last:border-0' data-pha={pha.pha_number}>
                      <td className='px-4 py-2'>
                        <Link href={'/process-safety/pha/' + pha.id} className='text-primary font-medium hover:underline'>
                          {pha.pha_number}
                        </Link>
                        <p>
                          {pha.title} · {pha.process_unit}
                        </p>
                      </td>
                      <td className='px-4 py-2'>{phaMethodLabel(pha.method)}</td>
                      <td className='px-4 py-2'>{names.get(pha.location_id) || 'Unknown'}</td>
                      <td className='px-4 py-2'>{phaStatusLabel(pha.status)}</td>
                      <td className='px-4 py-2' data-revalidation={state}>
                        {pha.revalidate_by || '—'}
                        {STATE_TEXT[state] ? <span className={state === 'overdue' ? 'text-error font-semibold' : 'text-warning font-semibold'}> ({STATE_TEXT[state]})</span> : null}
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
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{archived ? 'Nothing is archived.' : 'No hazard analyses recorded yet.'}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default PhaListPage
