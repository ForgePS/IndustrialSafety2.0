import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import TrainingRecordManage from '@/components/training/TrainingRecordManage'
import TrainingReportShell from '@/components/training/TrainingReportShell'
import { recordFiltersFrom, queryString } from '@/lib/forgeTrainingReportParams'
import { TRAINING_SOURCE_LABELS, getActiveCourses, searchTrainingRecords } from '@/lib/forgeTrainingReports'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Records' }

const usDate = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '—')
const field = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'
const KEYS = ['course', 'q', 'from', 'to', 'source', 'result']

const TrainingRecordsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('training.reports')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const filters = recordFiltersFrom(params)
  const searched = Object.values(filters).some(Boolean)

  // Edit / archive needs Record Completion; the action rechecks that each record's person is in its scope.
  const canManage = context.access.effective.some(item => item.permissionKey === 'training.record_completion' && item.allowed)

  const [courses, result] = await Promise.all([
    getActiveCourses(organizationId),
    searched ? searchTrainingRecords({ organizationId, userId: context.user.id, permission: context.permission }, filters) : Promise.resolve(null)
  ])

  const shown = result ? result.rows.slice(0, 500) : []

  return (
    <TrainingReportShell
      active='records'
      organizationName={context.activeOrganization.name}
      description='Search every training record: online, kiosk, paper and recorded completions.'
      csvHref={searched ? '/api/training/reports/records' + queryString(params, KEYS) : undefined}
    >
      <form className='flex flex-wrap items-end gap-3' action='/training/reports'>
        <input name='q' aria-label='Search' defaultValue={filters.q || ''} placeholder='Name, employee #, course or certificate' className={field + ' w-72'} />
        <select name='course' aria-label='Course' defaultValue={filters.courseId || ''} className={field}>
          <option value=''>Any course</option>
          {courses.map(course => (
            <option key={course.id} value={course.id}>
              {course.title}
              {course.is_active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        <select name='source' aria-label='How' defaultValue={filters.source || ''} className={field}>
          <option value=''>Any way</option>
          {Object.entries(TRAINING_SOURCE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select name='result' aria-label='Result' defaultValue={filters.result || ''} className={field}>
          <option value=''>Any result</option>
          <option value='passed'>Passed</option>
          <option value='completed'>Completed</option>
          <option value='failed'>Failed</option>
          <option value='incomplete'>Incomplete</option>
        </select>
        <label className='text-textSecondary flex flex-col text-xs'>
          From
          <input type='date' name='from' defaultValue={filters.from || ''} className={field} />
        </label>
        <label className='text-textSecondary flex flex-col text-xs'>
          To
          <input type='date' name='to' defaultValue={filters.to || ''} className={field} />
        </label>
        <Button type='submit'>Search</Button>
        {searched ? (
          <Link className='text-primary self-center text-sm hover:underline' href='/training/reports'>
            Clear
          </Link>
        ) : null}
      </form>

      {result ? (
        <>
          <p className='text-textSecondary text-sm' data-records-count>
            {result.rows.length} record{result.rows.length === 1 ? '' : 's'}
            {result.rows.length > shown.length ? `; showing the newest ${shown.length}. Download the CSV for all of them.` : '.'}
            {result.truncated ? ' Narrow the search: only the newest 5,000 were read.' : ''}
          </p>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Files</TableHead>
                  {canManage ? <TableHead className='text-right'>Manage</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length ? (
                  shown.map((row: any) => (
                    <TableRow key={row.id} data-training-record={row.courseTitle}>
                      <TableCell>
                        <Link className='font-semibold hover:underline' href={'/personnel/' + row.personnel_id}>
                          {row.personName}
                        </Link>
                        {row.archived ? (
                          <Badge variant='outline' className='ml-2'>
                            Archived
                          </Badge>
                        ) : null}
                        <div className='text-textSecondary text-xs'>{[row.employeeNumber && '#' + row.employeeNumber, row.department].filter(Boolean).join(' · ')}</div>
                      </TableCell>
                      <TableCell>{row.courseTitle}</TableCell>
                      <TableCell className='capitalize'>
                        {row.result}
                        {row.approval_status !== 'approved' ? <span className='text-textSecondary text-xs'> ({row.approval_status})</span> : null}
                      </TableCell>
                      <TableCell>{row.score === null || row.score === undefined ? '—' : `${Number(row.score)}%`}</TableCell>
                      <TableCell>{TRAINING_SOURCE_LABELS[row.source] || row.source}</TableCell>
                      <TableCell>{usDate(String(row.completed_at).slice(0, 10))}</TableCell>
                      <TableCell>{usDate(row.expires_at)}</TableCell>
                      <TableCell>
                        {(result.files.get(row.id) || []).map(file => (
                          <a key={file.id} className='text-primary block max-w-40 truncate text-xs hover:underline' href={'/api/training/completion-files/' + file.id} target='_blank' rel='noopener'>
                            {file.file_name}
                          </a>
                        ))}
                      </TableCell>
                      {canManage ? (
                        <TableCell className='text-right'>
                          <TrainingRecordManage record={{ ...row, label: `${row.personName} · ${row.courseTitle}` }} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={canManage ? 9 : 8} className='py-10 text-center'>
                      No training records match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : (
        <p className='text-textSecondary text-sm'>Search by name, course, date or how it was taken.</p>
      )}
    </TrainingReportShell>
  )
}

export default TrainingRecordsPage
