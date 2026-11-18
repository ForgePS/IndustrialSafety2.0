import Link from 'next/link'
import type { Metadata } from 'next'
import { TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import LotoTabs from '../LotoTabs'
import { getLockoutSearchOptions, getScopedLockouts } from '@/lib/forgeLoto'
import { lockoutSearchQuery, parseLockoutSearch } from '@/lib/forgeLotoList'
import { LOCKOUT_STATUS_LABELS, type LockoutStatus } from '@/lib/forgeLotoRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Lockouts' }

const selectClass = 'border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'

const LockoutsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('loto.view')
  const raw = await searchParams
  const view = raw.view === 'history' ? 'history' : 'open'
  const search = parseLockoutSearch(raw)
  const searching = Boolean(search.q || search.holder || search.asset || search.procedure)
  const organizationId = context.activeOrganization.id

  const [lockouts, options] = await Promise.all([
    getScopedLockouts({ organizationId, userId: context.user.id, permission: context.permission, view, search }),
    getLockoutSearchOptions({ organizationId, userId: context.user.id, permission: context.permission })
  ])

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
        <Link href={'/loto/lockouts' + lockoutSearchQuery('open', search)} className={'rounded-full border px-3 py-1 text-sm ' + (view === 'open' ? 'border-primary text-primary' : '')}>Open</Link>
        <Link href={'/loto/lockouts' + lockoutSearchQuery('history', search)} className={'rounded-full border px-3 py-1 text-sm ' + (view === 'history' ? 'border-primary text-primary' : '')}>History</Link>
      </div>

      <Card>
        <CardContent className='p-5'>
          <form method='get' action='/loto/lockouts' className='grid gap-3 md:grid-cols-[1fr_200px_200px_200px_auto]' role='search' aria-label='Search lockouts'>
            {view === 'history' ? <input type='hidden' name='view' value='history' /> : null}
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input name='q' defaultValue={search.q} placeholder='Lockout no., work, equipment, holder or lock ID...' className='pl-10' />
            </div>
            <select name='holder' aria-label='Lock holder' defaultValue={search.holder} className={selectClass}>
              <option value=''>All lock holders</option>
              {options.holders.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <select name='asset' aria-label='Equipment' defaultValue={search.asset} className={selectClass}>
              <option value=''>All equipment</option>
              {options.assets.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <select name='procedure' aria-label='Procedure' defaultValue={search.procedure} className={selectClass}>
              <option value=''>All procedures</option>
              {options.procedures.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <div className='flex gap-2'>
              <Button type='submit'>Search</Button>
              {searching ? (
                <Button variant='outline' asChild>
                  <Link href={view === 'history' ? '/loto/lockouts?view=history' : '/loto/lockouts'}>Clear</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lockout</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Procedure</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>{view === 'open' ? 'Locks on' : 'Lock holders'}</TableHead>
              <TableHead>Work</TableHead>
              <TableHead>{view === 'open' ? 'Issued' : 'Closed'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lockouts.length ? (
              lockouts.map((lockout: any) => {
                const locks = lockout.forge_loto_application_locks || []
                const on = view === 'open' ? locks.filter((lock: any) => !lock.removed_at) : locks

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
                  {searching ? 'No lockouts match the search.' : view === 'open' ? 'No equipment is locked out.' : 'No closed lockouts yet.'}
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
