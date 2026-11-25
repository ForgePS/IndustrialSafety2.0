import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import { DefectCloseButton } from '@/components/forklifts/TruckActionButtons'
import TruckStatusBadge from '@/components/forklifts/TruckStatusBadge'
import { formatWhen } from '@/components/permits/format'
import { companyTimeZone, forkliftRights, listDefects, listTrucks, rightsAt, userNameMap } from '@/lib/forgeForkliftAccess'
import { DEFECT_STATUS_LABELS } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklift defects' }

const SHOWN = 300

/** Port slice 19: defects across the trucks in scope, critical first; managers close them here. */
const DefectsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const closed = (await searchParams).status === 'closed'

  const [trucks, timeZone] = await Promise.all([listTrucks({ organizationId, rights, includeRetired: true }), companyTimeZone(organizationId)])
  const byId = new Map(trucks.map(truck => [truck.id, truck]))
  const all = trucks.length ? await listDefects({ organizationId, forkliftIds: trucks.map(truck => truck.id), openOnly: !closed }) : []

  const defects = closed
    ? all.filter(defect => defect.status !== 'open').sort((a, b) => String(b.resolved_at).localeCompare(String(a.resolved_at)))
    : all.sort((a, b) => Number(b.critical) - Number(a.critical) || String(b.reported_at).localeCompare(String(a.reported_at)))

  const users = closed ? await userNameMap(defects.slice(0, SHOWN).map(defect => defect.resolved_by)) : new Map<string, string>()
  const tab = (active: boolean) => '-mb-px border-b-2 px-3 py-2 text-sm font-medium ' + (active ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent')

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Defects</h1>
        <p className='text-textSecondary mt-2'>A defect that affects safe operation keeps the forklift out of service until it is repaired.</p>
      </div>
      <ForkliftTabs active='defects' canManage={Boolean(rights.manage)} />
      <nav className='flex gap-1 border-b' aria-label='Defect status'>
        <Link href='/forklifts/defects' className={tab(!closed)} aria-current={!closed ? 'page' : undefined}>
          Open
        </Link>
        <Link href='/forklifts/defects?status=closed' className={tab(closed)} aria-current={closed ? 'page' : undefined} data-closed-tab>
          Closed
        </Link>
      </nav>
      {defects.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-defect-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Defect</th>
                  <th className='px-4 py-2 font-semibold'>Truck</th>
                  <th className='px-4 py-2 font-semibold'>Reported</th>
                  <th className='px-4 py-2 font-semibold'>{closed ? 'Closed' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {defects.slice(0, SHOWN).map(defect => {
                  const truck = byId.get(defect.forklift_id)
                  const canClose = defect.status === 'open' && truck && rightsAt(rights, truck.asset.location_id).manage

                  return (
                    <tr key={defect.id} className='border-b last:border-0' data-defect-row={defect.item_label}>
                      <td className='px-4 py-2'>
                        {defect.critical ? (
                          <Badge size='sm' variant='destructive' className='mr-2'>
                            Critical
                          </Badge>
                        ) : null}
                        <span className='font-medium'>{defect.item_label}</span>
                        <p className='text-textSecondary text-xs'>{defect.description}</p>
                      </td>
                      <td className='px-4 py-2'>
                        {truck ? (
                          <>
                            <Link href={'/forklifts/trucks/' + truck.id} className='text-primary hover:underline'>
                              {truck.asset.name}
                            </Link>{' '}
                            <TruckStatusBadge status={truck.asset.status} />
                          </>
                        ) : (
                          'Unknown'
                        )}
                      </td>
                      <td className='px-4 py-2 text-xs'>
                        {defect.reported_by_name ? defect.reported_by_name + ', ' : ''}
                        {formatWhen(defect.reported_at, timeZone)}
                      </td>
                      <td className='px-4 py-2 text-xs'>
                        {closed ? (
                          <>
                            <span className='font-medium'>{DEFECT_STATUS_LABELS[defect.status] || defect.status}</span>, {users.get(defect.resolved_by) || ''} {formatWhen(defect.resolved_at, timeZone)}
                            {defect.resolution_note ? <p className='text-textSecondary'>{defect.resolution_note}</p> : null}
                          </>
                        ) : canClose ? (
                          <DefectCloseButton defectId={defect.id} label={defect.item_label} />
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {defects.length > SHOWN ? <p className='text-textSecondary p-4 text-sm'>Showing {SHOWN} of {defects.length}.</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{closed ? 'No closed defects.' : 'No open defects.'}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default DefectsPage
