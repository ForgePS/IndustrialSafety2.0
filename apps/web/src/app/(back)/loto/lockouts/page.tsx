import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import LotoTabs from '../LotoTabs'
import { getScopedLockouts } from '@/lib/forgeLoto'
import { LOCKOUT_STATUS_LABELS, type LockoutStatus } from '@/lib/forgeLotoRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Lockouts' }

const LockoutsPage = async ({ searchParams }: { searchParams: Promise<{ view?: string }> }) => {
  const context = await requireTenantPermission('loto.view')
  const { view: rawView } = await searchParams
  const view = rawView === 'history' ? 'history' : 'open'
  const organizationId = context.activeOrganization.id

  const lockouts = await getScopedLockouts({ organizationId, userId: context.user.id, permission: context.permission, view })
  const canSettings = context.access.effective.some(item => item.permissionKey === 'loto.settings' && item.allowed)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Lockout / Tagout</h1>
        <p className='text-textSecondary mt-2'>Equipment that is locked out right now, and every lockout that has closed.</p>
      </div>

      <LotoTabs active='lockouts' showSettings={canSettings} />

      <div className='flex gap-2'>
        <Link href='/loto/lockouts' className={'rounded-full border px-3 py-1 text-sm ' + (view === 'open' ? 'border-primary text-primary' : '')}>Open</Link>
        <Link href='/loto/lockouts?view=history' className={'rounded-full border px-3 py-1 text-sm ' + (view === 'history' ? 'border-primary text-primary' : '')}>History</Link>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lockout</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Procedure</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Locks on</TableHead>
              <TableHead>Work</TableHead>
              <TableHead>{view === 'open' ? 'Issued' : 'Closed'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lockouts.length ? (
              lockouts.map((lockout: any) => {
                const locks = lockout.forge_loto_application_locks || []
                const on = locks.filter((lock: any) => !lock.removed_at)

                return (
                  <TableRow key={lockout.id}>
                    <TableCell>
                      <Link href={'/loto/lockouts/' + lockout.id} className='font-medium hover:underline'>{lockout.lockout_number || 'Lockout'}</Link>
                    </TableCell>
                    <TableCell>
                      <div className='font-medium'>{lockout.forge_assets?.name || '—'}</div>
                      <div className='text-textSecondary text-xs'>
                        {lockout.forge_assets?.asset_number || ''}
                        {lockout.forge_assets?.locations?.name ? ' · ' + lockout.forge_assets.locations.name : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={'/loto/' + lockout.procedure_id} className='hover:underline'>{lockout.forge_loto_procedures?.procedure_number || '—'}</Link>
                      {lockout.revision_number ? <div className='text-textSecondary text-xs'>Rev {lockout.revision_number}</div> : null}
                    </TableCell>
                    <TableCell>
                      <Badge size='sm' variant={lockout.status === 'completed' ? 'tonalSuccess' : lockout.status === 'canceled' ? 'secondary' : 'destructive'}>
                        {LOCKOUT_STATUS_LABELS[lockout.status as LockoutStatus] || lockout.status}
                      </Badge>
                    </TableCell>
                    <TableCell className='max-w-xs whitespace-normal text-sm'>
                      {on.length ? on.map((lock: any) => lock.holder_name + (lock.lock_tag_id ? ' #' + lock.lock_tag_id : '')).join(', ') : '—'}
                    </TableCell>
                    <TableCell className='max-w-xs whitespace-normal'>{lockout.work_description || '—'}</TableCell>
                    <TableCell>
                      {new Date(view === 'open' ? lockout.started_at : lockout.completed_at || lockout.canceled_at || lockout.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className='py-8 text-center'>
                  {view === 'open' ? 'No equipment is locked out.' : 'No closed lockouts yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default LockoutsPage
