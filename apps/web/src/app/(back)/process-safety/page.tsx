import type { Metadata } from 'next'
import Link from 'next/link'
import { TbFlask } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { processSafetyTabs } from '@/components/process-safety/tabs'
import { companyLocations, listMocs, myPendingApprovals, psmRights, todayIso } from '@/lib/forgeProcessSafety'
import { changeTypeLabel, MOC_STATUSES, mocStatusLabel, riskLabel, temporaryOverdue } from '@/lib/forgeProcessSafetyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Process Safety' }

/** Port slice 16: management of change register. */
const ProcessSafetyPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('process_safety.view')
  const organizationId = context.activeOrganization.id
  const query = await searchParams
  const status = typeof query.status === 'string' && MOC_STATUSES.some(item => item.key === query.status) ? query.status : ''
  const rights = await psmRights(organizationId, context.user.id, context.access)

  const [mocs, locations, waiting] = await Promise.all([
    listMocs({ organizationId, rights, status: status || undefined }),
    companyLocations(organizationId),
    rights.approve ? myPendingApprovals(organizationId, context.user.id) : Promise.resolve([])
  ])

  const names = new Map(locations.map(location => [location.id, location.name]))
  const today = todayIso()
  const filters = [{ key: '', label: 'All' }, ...MOC_STATUSES]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbFlask />
            Process Safety
          </h1>
          <p className='text-textSecondary mt-2'>Review and approve changes before they go into service, and keep process hazard analyses current.</p>
        </div>
        {rights.manage ? (
          <Button asChild>
            <Link href='/process-safety/changes/new'>Raise a change</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={processSafetyTabs} current='changes' label='Process Safety' />
      {waiting.length ? (
        <Card>
          <CardContent className='flex flex-col gap-2 p-4' data-waiting-approvals>
            <p className='text-sm font-semibold'>Waiting for your approval</p>
            {waiting.map((moc: any) => (
              <Link key={moc.id} href={'/process-safety/changes/' + moc.id} className='text-primary text-sm hover:underline'>
                {moc.moc_number}: {moc.title}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <nav aria-label='Filter by status' className='flex flex-wrap gap-2 text-sm'>
        {filters.map(item => (
          <Link
            key={item.key || 'all'}
            href={'/process-safety' + (item.key ? '?status=' + item.key : '')}
            aria-current={status === item.key ? 'page' : undefined}
            className={'rounded-full border px-3 py-1 ' + (status === item.key ? 'border-primary text-primary' : 'text-textSecondary')}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {mocs.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-moc-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Change</th>
                  <th className='px-4 py-2 font-semibold'>Type</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Risk</th>
                  <th className='px-4 py-2 font-semibold'>Status</th>
                </tr>
              </thead>
              <tbody>
                {mocs.map((moc: any) => (
                  <tr key={moc.id} className='border-b last:border-0' data-moc={moc.moc_number}>
                    <td className='px-4 py-2'>
                      <Link href={'/process-safety/changes/' + moc.id} className='text-primary font-medium hover:underline'>
                        {moc.moc_number}
                      </Link>
                      <p>{moc.title}</p>
                      {moc.is_temporary ? (
                        <p className={'text-xs ' + (temporaryOverdue(moc, today) ? 'text-error font-semibold' : 'text-textSecondary')}>
                          Temporary until {moc.temporary_until}
                          {temporaryOverdue(moc, today) ? ' (overdue)' : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className='px-4 py-2'>{changeTypeLabel(moc.change_type)}</td>
                    <td className='px-4 py-2'>{names.get(moc.location_id) || 'Unknown'}</td>
                    <td className='px-4 py-2'>{riskLabel(moc.risk_level)}</td>
                    <td className='px-4 py-2' data-moc-status>
                      {mocStatusLabel(moc.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No changes yet.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default ProcessSafetyPage
