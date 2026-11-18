import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import TrainingReportShell from '@/components/training/TrainingReportShell'
import { queryString } from '@/lib/forgeTrainingReportParams'
import { getOverdueTraining } from '@/lib/forgeTrainingReports'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Overdue Training' }

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`
const field = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

/** 1.0 missed report: overdue training by department, then person, most days late first. */
const OverdueTrainingPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('training.reports')
  const params = await searchParams
  const q = String(params.q || '').trim().toLowerCase()
  const department = String(params.department || '')
  const all = await getOverdueTraining({ organizationId: context.activeOrganization.id, userId: context.user.id, permission: context.permission })
  const departments = [...new Set(all.map(row => row.department || 'No department'))].sort((a, b) => (a === 'No department' ? 1 : b === 'No department' ? -1 : a.localeCompare(b)))

  const rows = all
    .filter(row => !department || (row.department || 'No department') === department)
    .filter(row => !q || row.personName.toLowerCase().includes(q) || row.employeeNumber.toLowerCase().includes(q) || row.courseTitle.toLowerCase().includes(q))

  const groups = departments
    .map(name => {
      const inDepartment = rows.filter(row => (row.department || 'No department') === name)

      const people = [...new Set(inDepartment.map(row => row.personnel_id))]
        .map(id => inDepartment.filter(row => row.personnel_id === id))
        .sort((a, b) => a[0].personName.localeCompare(b[0].personName))

      return { name, people, count: inDepartment.length }
    })
    .filter(group => group.count)

  return (
    <TrainingReportShell
      active='overdue'
      organizationName={context.activeOrganization.name}
      description='Open training past its due date, whether or not it was started.'
      csvHref={'/api/training/reports/overdue' + queryString(params, ['q', 'department'])}
    >
      <form className='flex flex-wrap items-center gap-3' action='/training/reports/overdue'>
        <input name='q' aria-label='Search' defaultValue={q} placeholder='Name, employee # or course' className={field + ' w-64'} />
        <select name='department' aria-label='Department' defaultValue={department} className={field}>
          <option value=''>All departments</option>
          {departments.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Button type='submit' variant='outline'>
          Filter
        </Button>
        <span className='text-textSecondary text-sm' data-overdue-count>
          {rows.length} overdue assignment{rows.length === 1 ? '' : 's'} for {new Set(rows.map(row => row.personnel_id)).size} people
        </span>
      </form>

      {groups.length ? (
        groups.map(group => (
          <Card key={group.name}>
            <CardHeader>
              <CardTitle>
                {group.name} <span className='text-textSecondary text-sm font-normal'>· {group.count} overdue</span>
              </CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col divide-y'>
              {group.people.map(list => (
                <div key={list[0].personnel_id} className='py-3' data-overdue-person={list[0].personName}>
                  <Link className='font-semibold hover:underline' href={'/personnel/' + list[0].personnel_id}>
                    {list[0].personName}
                  </Link>
                  <span className='text-textSecondary text-sm'> {[list[0].employeeNumber && '#' + list[0].employeeNumber, list[0].location].filter(Boolean).join(' · ')}</span>
                  <ul className='mt-1 text-sm'>
                    {list.map(row => (
                      <li key={row.id} className='flex flex-wrap justify-between gap-2'>
                        <span>
                          {row.courseTitle}
                          {row.status === 'in_progress' ? <span className='text-textSecondary'> (started)</span> : null}
                        </span>
                        <span className='text-destructive'>
                          {row.daysLate} day{row.daysLate === 1 ? '' : 's'} late · due {usDate(row.due_date as string)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      ) : (
        <p className='text-textSecondary text-sm'>Nothing is overdue.</p>
      )}
    </TrainingReportShell>
  )
}

export default OverdueTrainingPage
