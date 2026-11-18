import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedWcCases, wcTodayIso } from '@/lib/forgeWorkersComp'
import { WC_STAGES, WC_STAGE_LABELS, WC_WORK_STATUS_LABELS, buildWcNextActions, thursdayWeekOf } from '@/lib/forgeWorkersCompRules'
import type { WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

export const metadata: Metadata = { title: 'Workers\' Compensation' }

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'

// List filters (1.0 workspace list). The default shows active and closed cases; archived cases have their own view.
const STATUS_FILTERS = [
  { value: '', label: 'Active and closed' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' }
] as const

const param = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : '')

const WorkersCompPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const params = await searchParams
  const q = param(params.q).slice(0, 200)
  const statusFilter = STATUS_FILTERS.some(item => item.value === param(params.status)) ? param(params.status) : ''
  const stageFilter = (WC_STAGES as readonly string[]).includes(param(params.stage)) ? param(params.stage) : ''

  const context = await requireTenantPermission('workers_comp.view')
  const organizationId = context.activeOrganization.id
  const today = wcTodayIso()
  const weekOf = thursdayWeekOf(today)

  const [cases, archived] = await Promise.all([
    getScopedWcCases({ organizationId, userId: context.user.id, permission: context.permission }),
    statusFilter === 'archived'
      ? getScopedWcCases({ organizationId, userId: context.user.id, permission: context.permission, archivedOnly: true })
      : Promise.resolve([])
  ])

  const active = cases.filter((row: any) => row.status === 'active')
  const needle = q.toLowerCase()

  // Search covers case number, employee, claim number and carrier, as in 1.0.
  const listed = (statusFilter === 'archived' ? archived : cases).filter((row: any) => {
    if (statusFilter && row.status !== statusFilter) return false
    if (stageFilter && row.stage !== stageFilter) return false
    if (!needle) return true

    return [row.case_number, row.employee_name, row.claim_number, row.forge_wc_carriers?.name].some(value => String(value || '').toLowerCase().includes(needle))
  })

  const filtered = Boolean(q || statusFilter || stageFilter)

  const supabase = createServiceRoleClient() as any

  const { data: weekUpdates } = active.length
    ? await supabase.from('forge_wc_weekly_updates').select('case_id').eq('organization_id', organizationId).eq('week_of', weekOf).in('case_id', active.map((row: any) => row.id))
    : { data: [] }

  const updated = new Set((weekUpdates || []).map((row: any) => row.case_id))

  const nextActions = buildWcNextActions(
    active.map((row: any) => ({
      ...row,
      carrier_name: row.forge_wc_carriers?.name || null,
      days_away: row.daysAway
    })),
    today
  )

  const allowed = (key: string) => context.access.effective.some(item => item.permissionKey === key && item.allowed)

  const tiles = [
    { label: 'Active cases', value: active.length, testId: 'wc-active-count' },
    { label: 'Off work today', value: active.filter((row: any) => row.current_work_status === 'off_work').length },
    { label: 'Restricted duty today', value: active.filter((row: any) => row.current_work_status === 'restricted').length },
    { label: `Weekly updates missing (week of ${weekOf})`, value: active.filter((row: any) => !updated.has(row.id)).length },
    { label: 'Overdue follow-ups', value: nextActions.filter(action => action.overdue).length }
  ]

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Workers&apos; Compensation</h1>
          <p className='text-textSecondary mt-2'>Claims, work status, restrictions, medical visits and weekly updates.</p>
        </div>
        <div className='flex flex-wrap gap-3'>
          {allowed('workers_comp.configure') ? <Button variant='outline' asChild><Link href='/workers-comp/carriers'>Carriers</Link></Button> : null}
          {allowed('workers_comp.configure') ? <Button variant='outline' asChild><Link href='/workers-comp/settings'>Settings</Link></Button> : null}
          {allowed('workers_comp.export') ? <Button variant='outline' asChild><Link href='/workers-comp/reports'>Reports</Link></Button> : null}
          <Button variant='outline' asChild><Link href='/workers-comp/queues'>Queues</Link></Button>
          <Button variant='outline' asChild><Link href='/workers-comp/weekly'>Weekly Updates</Link></Button>
          {allowed('workers_comp.create') ? <Button asChild><Link href='/workers-comp/create'>New Case</Link></Button> : null}
        </div>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-5'>
        {tiles.map(tile => (
          <Card key={tile.label}>
            <CardHeader className='pb-2'><CardDescription>{tile.label}</CardDescription></CardHeader>
            <CardContent><div className='text-textPrimary text-2xl font-bold' data-testid={tile.testId}>{tile.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next Actions</CardTitle>
          <CardDescription>Follow-ups owed on active cases, overdue first.</CardDescription>
        </CardHeader>
        <CardContent>
          {nextActions.length ? (
            <ul className='flex flex-col gap-3' data-testid='wc-next-actions'>
              {nextActions.slice(0, 25).map(action => (
                <li key={action.id} className='flex flex-wrap items-start justify-between gap-3 border-b pb-3 last:border-b-0'>
                  <div>
                    <div className='text-textPrimary font-semibold'>
                      {action.title}
                      {action.overdue ? <Badge size='sm' variant='destructive' className='ms-2'>{action.daysOverdue}d overdue</Badge> : null}
                    </div>
                    <div className='text-textSecondary text-sm'>{action.caseNumber} · {action.employee} · due {action.dueDate}</div>
                    <div className='text-textSecondary text-xs'>{action.reason}</div>
                  </div>
                  <Button size='sm' variant='outline' asChild><Link href={`/workers-comp/${action.caseId}`}>Open</Link></Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No follow-ups are due.</p>
          )}
        </CardContent>
      </Card>

      <Card className='min-w-0 [contain:inline-size]'>
        <CardHeader className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <CardTitle>{statusFilter === 'archived' ? 'Archived Cases' : 'Cases'}</CardTitle>
            {statusFilter === 'archived'
              ? <Button size='sm' variant='outline' asChild><Link href='/workers-comp'>Back to open cases</Link></Button>
              : <Button size='sm' variant='outline' asChild><Link href='/workers-comp?status=archived' data-testid='wc-archived-link'>Archived</Link></Button>}
          </div>
          <form method='get' action='/workers-comp' className='grid grid-cols-1 gap-3 md:grid-cols-12' data-testid='wc-case-filters'>
            <div className='md:col-span-5'>
              <Label htmlFor='wc-filter-q'>Search</Label>
              <Input id='wc-filter-q' name='q' className='mt-2' defaultValue={q} placeholder='Case, employee, claim number or carrier' />
            </div>
            <div className='md:col-span-3'>
              <Label htmlFor='wc-filter-status'>Status</Label>
              <select id='wc-filter-status' name='status' className={selectClass} defaultValue={statusFilter}>
                {STATUS_FILTERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className='md:col-span-2'>
              <Label htmlFor='wc-filter-stage'>Stage</Label>
              <select id='wc-filter-stage' name='stage' className={selectClass} defaultValue={stageFilter}>
                <option value=''>All stages</option>
                {WC_STAGES.map(stage => <option key={stage} value={stage}>{WC_STAGE_LABELS[stage]}</option>)}
              </select>
            </div>
            <div className='flex items-end gap-2 md:col-span-2'>
              <Button type='submit'>Filter</Button>
              {filtered ? <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Clear</Link></Button> : null}
            </div>
          </form>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Injury Date</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Work Status</TableHead>
              <TableHead>Days Away / Restricted</TableHead>
              <TableHead>Claim</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listed.length ? listed.map((row: any) => (
              <TableRow key={row.id} data-testid={`wc-case-row-${row.case_number}`}>
                <TableCell className='font-semibold'>{row.case_number}</TableCell>
                <TableCell>{row.employee_name}</TableCell>
                <TableCell>{row.injury_date}</TableCell>
                <TableCell>
                  {WC_STAGE_LABELS[row.stage as WcStage]}
                  {row.status !== 'active' ? <Badge size='sm' variant='secondary' className='ms-2 capitalize'>{row.status}</Badge> : null}
                </TableCell>
                <TableCell>{row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : '—'}</TableCell>
                <TableCell>{row.daysAway} / {row.restrictedDays}</TableCell>
                <TableCell>{row.is_self_pay ? 'Self pay' : row.claim_number || <span className='text-destructive'>Missing</span>}</TableCell>
                <TableCell className='text-right'>
                  <Button size='sm' variant='outline' asChild><Link href={`/workers-comp/${row.id}`}>Open</Link></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className='py-10 text-center'>{filtered ? 'No cases match these filters.' : 'No workers\' comp cases.'}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default WorkersCompPage
