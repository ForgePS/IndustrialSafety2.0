import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import WeeklyNoteForm from './WeeklyNoteForm'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWeeklyStatusReport, wcRecordWithinScope, wcTodayIso } from '@/lib/forgeWorkersComp'
import { WC_WORK_STATUS_LABELS, addDaysIso, canEditAuthoredNote, thursdayWeekOf, weeklyUpdateStatus } from '@/lib/forgeWorkersCompRules'
import type { WcWorkStatus } from '@/lib/forgeWorkersCompRules'

export const metadata: Metadata = { title: 'Workers\' Comp Weekly Updates' }

const WeeklyUpdatesPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('workers_comp.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const today = wcTodayIso()
  const params = await searchParams
  const requested = typeof params.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today
  const weekOf = thursdayWeekOf(requested > today ? today : requested)

  const cases = await getWeeklyStatusReport({ organizationId, userId, permission: context.permission, weekOf })

  const editPermission = context.access.effective.find(item => item.permissionKey === 'workers_comp.edit' && item.allowed)
  const canConfigure = context.access.effective.some(item => item.permissionKey === 'workers_comp.configure' && item.allowed)
  const canExport = context.access.effective.some(item => item.permissionKey === 'workers_comp.export' && item.allowed)

  const rows = await Promise.all(
    cases.map(async (row: any) => {
      const update = row.weekly_update
      const mayEdit = editPermission ? await wcRecordWithinScope({ organizationId, userId, scope: editPermission.scope, record: row }) : false

      return {
        row,
        update,
        status: weeklyUpdateStatus(weekOf, Boolean(update), today),
        canWrite: mayEdit && (!update || canEditAuthoredNote({ userId, createdBy: update.created_by, canConfigure }))
      }
    })
  )

  const missing = rows.filter(item => item.status !== 'complete').length

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Workers&apos; Comp</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Weekly Updates: Thursday {weekOf}</h1>
          <p className='text-textSecondary mt-2'>{rows.length} open case{rows.length === 1 ? '' : 's'} · {missing} without an update.</p>
        </div>
        <div className='flex flex-wrap gap-3'>
          <Button variant='outline' asChild><Link href={`/workers-comp/weekly?week=${addDaysIso(weekOf, -7)}`}>Previous Week</Link></Button>
          {weekOf < thursdayWeekOf(today) ? <Button variant='outline' asChild><Link href={`/workers-comp/weekly?week=${addDaysIso(weekOf, 7)}`}>Next Week</Link></Button> : null}
          {canExport ? <Button variant='outline' asChild><a href={`/api/workers-comp/weekly?week=${weekOf}`}>Download CSV</a></Button> : null}
          <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Back</Link></Button>
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        {rows.length ? rows.map(({ row, update, status, canWrite }) => (
          <Card key={row.id} data-testid={`wc-weekly-row-${row.case_number}`}>
            <CardHeader className='pb-2'>
              <CardTitle className='flex flex-wrap items-center gap-2 text-base'>
                <Link className='text-primary hover:underline' href={`/workers-comp/${row.id}`}>{row.case_number}</Link>
                <span>{row.employee_name}</span>
                <Badge size='sm' variant={status === 'complete' ? 'tonalSuccess' : status === 'overdue' ? 'destructive' : 'secondary'}>
                  {status === 'complete' ? 'Complete' : status === 'overdue' ? 'Overdue' : 'Due'}
                </Badge>
              </CardTitle>
              <CardDescription>
                {row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : 'No work status'} · {row.daysAway} days away · {row.restrictedDays} restricted
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <WeeklyNoteForm caseId={row.id} caseNumber={row.case_number} weekOf={weekOf} initialNotes={update?.notes || ''} />
              ) : (
                <p className='text-textSecondary whitespace-pre-wrap text-sm'>{update?.notes || 'No update yet.'}</p>
              )}
            </CardContent>
          </Card>
        )) : (
          <Card><CardContent className='p-6 text-center'>No open cases for this week.</CardContent></Card>
        )}
      </div>
    </div>
  )
}

export default WeeklyUpdatesPage
