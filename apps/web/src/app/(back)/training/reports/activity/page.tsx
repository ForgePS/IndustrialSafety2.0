import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import TrainingReportShell from '@/components/training/TrainingReportShell'
import { activityPeriodFrom, queryString } from '@/lib/forgeTrainingReportParams'
import { getTrainingActivity } from '@/lib/forgeTrainingReports'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Activity' }

const field = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 1.0 team roster / recent activity by course, for a year or month, a location and a group. */
const TrainingActivityPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('training.reports')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const period = activityPeriodFrom(params)
  const supabase = createServiceRoleClient() as any

  const [rows, { data: locations }, { data: groups }] = await Promise.all([
    getTrainingActivity({ organizationId, userId: context.user.id, permission: context.permission }, period),
    supabase.from('locations').select('id, name').eq('organization_id', organizationId).order('name'),
    supabase.from('forge_training_groups').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  const thisYear = Number(new Date().getUTCFullYear())
  const totals = rows.reduce((sum, row) => ({ assigned: sum.assigned + row.assigned, completed: sum.completed + row.completed, inProgress: sum.inProgress + row.inProgress }), { assigned: 0, completed: 0, inProgress: 0 })

  return (
    <TrainingReportShell
      active='activity'
      organizationName={context.activeOrganization.name}
      description='Who was assigned, started and finished training, by course.'
      csvHref={'/api/training/reports/activity' + queryString(params, ['year', 'month', 'location', 'group'])}
    >
      <form className='flex flex-wrap items-center gap-3' action='/training/reports/activity'>
        <select name='year' aria-label='Year' defaultValue={period.year} className={field}>
          {Array.from({ length: 6 }, (_, index) => String(thisYear - index)).map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select name='month' aria-label='Month' defaultValue={period.month} className={field}>
          <option value=''>Whole year</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, '0')}>
              {name}
            </option>
          ))}
        </select>
        <select name='location' aria-label='Location' defaultValue={period.locationId || ''} className={field}>
          <option value=''>All locations</option>
          {(locations || []).map((item: any) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select name='group' aria-label='Group' defaultValue={period.groupId || ''} className={field}>
          <option value=''>All groups</option>
          {(groups || []).map((item: any) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button type='submit' variant='outline'>
          Show
        </Button>
      </form>

      <p className='text-textSecondary text-sm' data-activity-totals>
        {rows.length} course{rows.length === 1 ? '' : 's'} · {totals.assigned} assigned · {totals.inProgress} in progress · {totals.completed} completed
      </p>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead className='text-right'>Assigned</TableHead>
              <TableHead className='text-right'>In progress</TableHead>
              <TableHead className='text-right'>Completed</TableHead>
              <TableHead>Latest activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map(row => (
                <TableRow key={row.courseId} data-activity-course={row.courseTitle}>
                  <TableCell className='font-semibold'>{row.courseTitle}</TableCell>
                  <TableCell className='text-right'>{row.assigned}</TableCell>
                  <TableCell className='text-right'>{row.inProgress}</TableCell>
                  <TableCell className='text-right'>{row.completed}</TableCell>
                  <TableCell>{row.latest ? new Date(row.latest).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className='py-10 text-center'>
                  No training activity in this period.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </TrainingReportShell>
  )
}

export default TrainingActivityPage
