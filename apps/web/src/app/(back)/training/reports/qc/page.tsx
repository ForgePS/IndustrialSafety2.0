import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import TrainingReportShell from '@/components/training/TrainingReportShell'
import { qcParamsFrom, queryString } from '@/lib/forgeTrainingReportParams'
import { QC_DAY_OPTIONS, getActiveCourses, getTrainingQc } from '@/lib/forgeTrainingReports'
import { QC_LOW_THRESHOLD, qcTone } from '@/lib/forgeTrainingReportRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Quiz QC' }

const field = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'
const TONE: Record<string, string> = { good: 'text-success', warn: 'text-warning', bad: 'text-destructive', muted: 'text-textSecondary' }
const percent = (value: number | null) => (value === null ? '—' : `${value}%`)

/** 1.0 training QC: how quizzes perform and which questions people miss. */
const TrainingQcPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('training.reports')
  const organizationId = context.activeOrganization.id
  const params = await searchParams
  const filters = qcParamsFrom(params)
  const [courses, report] = await Promise.all([getActiveCourses(organizationId), getTrainingQc({ organizationId, userId: context.user.id, permission: context.permission }, filters)])
  const titles = new Map(courses.map(course => [course.id, course.title]))
  const { summary } = report
  const maxBucket = Math.max(1, ...Object.values(report.buckets))

  const tiles = [
    { label: 'Pass rate', value: percent(summary.passRate), tone: qcTone(summary.passRate) },
    { label: 'First-try pass rate', value: percent(summary.firstAttemptPassRate), tone: qcTone(summary.firstAttemptPassRate) },
    { label: 'Average score', value: percent(summary.averageScore), tone: qcTone(summary.averageScore) },
    { label: 'Attempts to pass', value: summary.averageAttemptsToPass === null ? '—' : String(summary.averageAttemptsToPass), tone: 'muted' },
    { label: 'Learners', value: String(summary.learners), tone: 'muted' },
    { label: 'Quizzes submitted', value: String(summary.attempts), tone: 'muted' }
  ]

  return (
    <TrainingReportShell
      active='qc'
      organizationName={context.activeOrganization.name}
      description='How quizzes perform, and the questions people miss most.'
      csvHref={'/api/training/reports/qc' + queryString(params, ['course', 'days'])}
    >
      <form className='flex flex-wrap items-center gap-3' action='/training/reports/qc'>
        <select name='course' aria-label='Course' defaultValue={filters.courseId || ''} className={field}>
          <option value=''>All courses</option>
          {courses.map(course => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
        <select name='days' aria-label='Period' defaultValue={String(filters.days)} className={field}>
          {QC_DAY_OPTIONS.map(days => (
            <option key={days} value={days}>
              {days ? `Last ${days} days` : 'All time'}
            </option>
          ))}
        </select>
        <Button type='submit' variant='outline'>
          Show
        </Button>
        {summary.inProgress ? <span className='text-textSecondary text-sm'>{summary.inProgress} quiz{summary.inProgress === 1 ? '' : 'zes'} in progress</span> : null}
      </form>

      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6' data-qc-summary>
        {tiles.map(tile => (
          <Card key={tile.label}>
            <CardContent className='pt-6'>
              <div className='text-textSecondary text-xs'>{tile.label}</div>
              <div className={'text-2xl font-bold ' + TONE[tile.tone]}>{tile.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-6 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Score spread</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-2'>
            {Object.entries(report.buckets).map(([bucket, count]) => (
              <div key={bucket} className='flex items-center gap-3 text-sm'>
                <span className='w-16 shrink-0'>{bucket}%</span>
                <span className='bg-primary h-3 rounded' style={{ width: `${(count / maxBucket) * 70}%`, minWidth: count ? 4 : 0 }} />
                <span className='text-textSecondary'>{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By month</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-1 text-sm'>
            {report.months.length ? (
              report.months.map(row => (
                <div key={row.month} className='flex justify-between'>
                  <span>{row.month}</span>
                  <span>
                    {row.attempts} submitted · <span className={TONE[qcTone(row.passRate)]}>{percent(row.passRate)} passed</span>
                  </span>
                </div>
              ))
            ) : (
              <p className='text-textSecondary'>No quizzes in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
          <CardDescription>
            Hardest first. {report.lowQuestions.length} question{report.lowQuestions.length === 1 ? ' is' : 's are'} answered correctly less than {QC_LOW_THRESHOLD}% of the time; consider rewording them or the course
            content they cover.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col divide-y text-sm'>
          {report.questionStats.length ? (
            report.questionStats.slice(0, 100).map(row => (
              <div key={row.id} className='flex flex-wrap justify-between gap-2 py-2' data-qc-question>
                <span className='max-w-3xl'>
                  {row.stem}
                  {!filters.courseId ? <span className='text-textSecondary'> · {titles.get(row.course_id) || '—'}</span> : null}
                </span>
                <span className='shrink-0'>
                  <span className={'font-semibold ' + TONE[qcTone(row.correctRate)]}>{row.correctRate}%</span>
                  <span className='text-textSecondary'>
                    {' '}
                    correct of {row.presented}
                  </span>
                </span>
              </div>
            ))
          ) : (
            <p className='text-textSecondary py-2'>No answered questions in this period.</p>
          )}
        </CardContent>
      </Card>
      {report.truncated ? <p className='text-textSecondary text-sm'>Only the newest 20,000 quizzes were read. Pick a course or a shorter period.</p> : null}
    </TrainingReportShell>
  )
}

export default TrainingQcPage
