import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'
import type { SupportReport } from '@/lib/forgeSupportOperations'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

export const metadata: Metadata = { title: 'Support Reports' }

const day = (value: Date) => value.toISOString().slice(0, 10)
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && day(new Date(value)) === value
const hours = (value: number | null) => value == null ? '—' : Number(value).toFixed(1) + ' h'

export default async function SupportReports({ searchParams }: {
  searchParams: Promise<{ start?: string; end?: string }>
}) {
  await requireForgePlatformRole(['forge_owner', 'forge_creator', 'forge_support'])
  const params = await searchParams
  const today = new Date()
  const start = params.start ?? day(new Date(today.getTime() - 29 * 86400000))
  const end = params.end ?? day(today)
  const valid = validDay(start) && validDay(end) && start <= end &&
    Date.parse(end) - Date.parse(start) <= 365 * 86400000

  let report: SupportReport | null = null
  if (valid) {
    const db = createServiceRoleClient() as any
    const { data, error } = await db.rpc('forge_support_report', {
      p_start: new Date(start).toISOString(),
      p_end: new Date(Date.parse(end) + 86400000).toISOString()
    })
    if (error) throw new Error('Unable to load support reports.')
    report = data as SupportReport
  }

  const responseRate = report?.summary.responded_with_target
    ? Math.round(report.summary.responses_within_target / report.summary.responded_with_target * 100) + '%'
    : '—'
  const satisfaction = report?.feedback.responses
    ? Math.round(report.feedback.satisfied / report.feedback.responses * 100) + '%'
    : '—'

  return (
    <div className='grid gap-6'>
      <div>
        <Link href='/admin/creator/support' className='text-primary text-sm'>← Support queue</Link>
        <h1 className='mt-3 text-3xl font-bold'>Support reports</h1>
        <p className='text-textSecondary mt-2'>Ticket creation dates and time calculations use UTC. The selected date range includes both dates.</p>
      </div>
      <form className='flex flex-wrap items-end gap-4'>
        <label className='grid gap-1 text-sm font-medium'>Start date<Input required type='date' name='start' defaultValue={start} /></label>
        <label className='grid gap-1 text-sm font-medium'>End date<Input required type='date' name='end' defaultValue={end} /></label>
        <Button type='submit'>Apply dates</Button>
      </form>
      {!valid ? <p role='alert' className='text-destructive'>Choose valid dates in order, covering at most 366 days.</p> : null}
      {report ? (
        <>
          <p className='text-textSecondary text-sm'>Period metrics cover all tickets created in this range, including feedback submitted later. They use the full database cohort rather than the queue display limit.</p>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <Metric label='Requests created' value={report.summary.total} />
            <Metric label='Still active in period' value={report.summary.active} />
            <Metric label='Resolved or closed' value={report.summary.resolved} />
            <Metric label='Unanswered and overdue' value={report.summary.response_overdue} />
            <Metric label='Resolution overdue' value={report.summary.resolution_overdue} />
            <Metric label='Average first response' value={hours(report.summary.average_response_hours)} />
            <Metric label='Average resolution' value={hours(report.summary.average_resolution_hours)} />
            <Metric label='Responded within target' value={responseRate} />
          </div>
          <Card>
            <CardHeader><CardTitle>Customer satisfaction</CardTitle></CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-3'>
              <div><p className='text-textSecondary text-sm'>Feedback responses</p><p className='text-2xl font-bold' data-testid='support-feedback-count'>{report.feedback.responses}</p></div>
              <div><p className='text-textSecondary text-sm'>Average rating</p><p className='text-2xl font-bold'>{report.feedback.average_rating == null ? '—' : Number(report.feedback.average_rating).toFixed(1) + ' / 5'}</p></div>
              <div><p className='text-textSecondary text-sm'>Satisfied (4 or 5)</p><p className='text-2xl font-bold'>{satisfaction}</p></div>
            </CardContent>
          </Card>
          <div className='grid gap-4 md:grid-cols-2'>
            <Breakdown title='By category' rows={report.categories.map(row => ({ label: row.category.replaceAll('_', ' '), count: row.total }))} />
            <Breakdown title='By priority' rows={report.priorities.map(row => ({ label: row.priority, count: row.total }))} />
          </div>
          <Card>
            <CardHeader><CardTitle>Current backlog across all dates</CardTitle></CardHeader>
            <CardContent><p>{report.backlog.total} active requests · {report.backlog.unassigned} unassigned</p></CardContent>
          </Card>
          <p className='text-textSecondary text-sm'>Response compliance includes responded requests that have a response target. Open unanswered requests appear in the overdue count. Resolution averages include tickets currently resolved or closed and use elapsed hours.</p>
        </>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className='p-4'><p className='text-textSecondary text-sm'>{label}</p><p className='mt-1 text-2xl font-bold'>{value}</p></CardContent></Card>
}
function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      <table className='w-full text-sm'>
        <thead><tr className='border-b text-left'><th className='pb-2'>Group</th><th className='pb-2 text-right'>Requests</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className='border-b'><td className='py-2 capitalize'>{row.label}</td><td className='py-2 text-right'>{row.count}</td></tr>)}</tbody>
      </table>
      {!rows.length ? <p className='text-textSecondary py-3 text-sm'>No requests in this period.</p> : null}
    </CardContent></Card>
  )
}
