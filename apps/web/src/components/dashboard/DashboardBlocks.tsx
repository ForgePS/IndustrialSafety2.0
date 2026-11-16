import Link from 'next/link'
import { TbArrowRight, TbLayoutDashboard, TbPlus } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { cn } from '@repo/ui/lib/utils'

import IncidentTrendChart from '@/components/dashboard/IncidentTrendChart'
import type { DashboardData, QuickAction } from '@/lib/forgeDashboard'
import type { AttentionItem, AttentionTone } from '@/lib/forgeDashboardRules'
import type { EffectiveExperienceElement } from '@/lib/forgeExperience'

/** Server-rendered dashboard blocks (1.0 industrial-dashboard). Charts are plain bars, so nothing loads a chart library. */

const TONE: Record<AttentionTone, string> = {
  danger: 'border-destructive/40 text-destructive',
  warning: 'border-warning/50 text-warning',
  info: 'border-primary/30 text-primary',
  primary: 'border-primary/40 text-primary',
  muted: 'border-border text-textSecondary'
}

const usDate = (iso: string | null) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'No due date')

export const AttentionBlock = ({ items, quickActions }: { items: AttentionItem[] | null; quickActions: QuickAction[] }) => {
  const busy = (items || []).filter(item => item.count > 0)
  const clear = (items || []).filter(item => item.count === 0)

  return (
    <Card className='h-full' data-testid='dashboard-attention'>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <CardTitle>What Needs Your Attention</CardTitle>
            <CardDescription>{busy.length ? 'Open work across your modules.' : 'Nothing is waiting on you right now.'}</CardDescription>
          </div>
          {quickActions.length ? (
            <div className='flex flex-wrap gap-2' data-testid='dashboard-quick-actions'>
              {quickActions.map(action => (
                <Button key={action.key} size='sm' variant='outline' asChild>
                  <Link href={action.href}>
                    <TbPlus />
                    {action.label}
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {busy.length ? (
          <div className='grid grid-cols-2 gap-3 xl:grid-cols-4'>
            {busy.map(item => (
              <Link
                key={item.key}
                href={item.href}
                data-attention={item.key}
                className={cn('bg-card hover:bg-primary/5 flex flex-col gap-1 rounded-lg border-l-4 border p-3 transition-colors', TONE[item.tone])}
              >
                <span className='text-3xl font-bold'>{item.count}</span>
                <span className='text-textPrimary text-sm font-medium'>{item.label}</span>
                {item.detail ? <span className='text-textSecondary text-xs'>{item.detail}</span> : null}
              </Link>
            ))}
          </div>
        ) : null}
        {clear.length ? (
          <p className='text-textSecondary text-xs' data-testid='dashboard-attention-clear'>
            Nothing waiting: {clear.map(item => item.label).join(' · ')}
          </p>
        ) : null}
        {!items ? <p className='text-textSecondary text-sm'>None of your modules has items to track here.</p> : null}
      </CardContent>
    </Card>
  )
}

export const TasksDueBlock = ({ tasks }: { tasks: NonNullable<DashboardData['tasksDue']> }) => (
  <Card className='h-full' data-testid='dashboard-tasks-due'>
    <CardHeader>
      <CardTitle>Tasks Due</CardTitle>
      <CardDescription>Your open tasks, overdue first.</CardDescription>
    </CardHeader>
    <CardContent>
      {tasks.length ? (
        <ul className='divide-border flex flex-col divide-y'>
          {tasks.map(task => (
            <li key={task.id}>
              <Link href={`/tasks/${task.id}`} className='hover:text-primary flex items-center justify-between gap-3 py-2 text-sm'>
                <span className='min-w-0 truncate font-medium'>{task.title}</span>
                <span className={cn('shrink-0 text-xs', task.overdue ? 'text-destructive font-semibold' : 'text-textSecondary')}>
                  {task.overdue ? 'Overdue · ' : ''}
                  {usDate(task.due_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary text-sm'>No open tasks are assigned to you.</p>
      )}
    </CardContent>
  </Card>
)

export const TaskSchedulerBlock = ({ schedule }: { schedule: NonNullable<DashboardData['taskScheduler']> }) => {
  const tiles = [
    { label: 'Overdue', value: schedule.overdue, tone: 'text-destructive' },
    { label: 'Due this week', value: schedule.dueThisWeek, tone: 'text-warning' },
    { label: 'Later', value: schedule.later, tone: 'text-primary' },
    { label: 'No due date', value: schedule.noDueDate, tone: 'text-textSecondary' }
  ]

  const statuses = [
    { label: 'Open', value: schedule.byStatus.open },
    { label: 'In progress', value: schedule.byStatus.in_progress },
    { label: 'Blocked', value: schedule.byStatus.blocked },
    { label: 'Completed', value: schedule.byStatus.completed }
  ]

  return (
    <Card className='h-full' data-testid='dashboard-task-scheduler'>
      <CardHeader>
        <CardTitle>Task Scheduler</CardTitle>
        <CardDescription>Open tasks in your scope by due date.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='grid grid-cols-2 gap-3'>
          {tiles.map(tile => (
            <Link key={tile.label} href='/tasks' className='border-border hover:bg-primary/5 rounded-md border p-2'>
              <span className={cn('block text-2xl font-bold', tile.tone)}>{tile.value}</span>
              <span className='text-textSecondary text-xs'>{tile.label}</span>
            </Link>
          ))}
        </div>
        <BarList rows={statuses.map(item => ({ label: item.label, count: item.value }))} />
      </CardContent>
    </Card>
  )
}

const BarList = ({ rows, empty = 'Nothing to show yet.' }: { rows: Array<{ label: string; count: number }>; empty?: string }) => {
  const max = Math.max(1, ...rows.map(row => row.count))

  if (!rows.length) return <p className='text-textSecondary text-sm'>{empty}</p>

  return (
    <ul className='flex flex-col gap-2'>
      {rows.map(row => (
        <li key={row.label} className='grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-2 text-sm'>
          <span className='truncate' title={row.label}>
            {row.label}
          </span>
          <span className='bg-primary/10 h-2.5 overflow-hidden rounded-full'>
            <span className='bg-primary block h-full rounded-full' style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
          <span className='text-right font-medium'>{row.count}</span>
        </li>
      ))}
    </ul>
  )
}

export const IncidentTrendBlock = ({
  months,
  years,
  todayIso
}: {
  months: NonNullable<DashboardData['incidentTrend']>
  years: DashboardData['incidentYears']
  todayIso: string
}) => {
  const total = months.reduce((sum, month) => sum + month.total, 0)
  const anyYears = (years || []).some(year => year.total > 0)

  return (
    <Card className='h-full' data-testid='dashboard-incident-trend'>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div>
            <CardTitle>Incident Trend</CardTitle>
            <CardDescription>{total} reported in the last 12 months.</CardDescription>
          </div>
          <Link href='/incidents' className='text-primary text-sm font-semibold'>
            View incidents →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {total || anyYears ? (
          <IncidentTrendChart months={months} years={years} currentMonth={Number(todayIso.slice(5, 7))} />
        ) : (
          <p className='text-textSecondary text-sm'>No incidents in the last 5 years.</p>
        )}
      </CardContent>
    </Card>
  )
}

export const InjuryHistoryBlock = ({ rows, hasOsha }: { rows: NonNullable<DashboardData['injuryHistory']>; hasOsha: boolean }) => (
  <Card className='h-full' data-testid='dashboard-injury-history'>
    <CardHeader>
      <CardTitle>Injury History</CardTitle>
      <CardDescription>By year{hasOsha ? ', with OSHA recordables and DART cases' : ''}.</CardDescription>
    </CardHeader>
    <CardContent className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='text-textSecondary text-left text-xs'>
            <th className='py-1 font-medium'>Year</th>
            <th className='py-1 text-right font-medium'>Injury incidents</th>
            {hasOsha ? (
              <>
                <th className='py-1 text-right font-medium'>Recordable</th>
                <th className='py-1 text-right font-medium'>DART</th>
                <th className='py-1 text-right font-medium'>Days away</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody className='divide-border divide-y'>
          {rows.map(row => (
            <tr key={row.year} data-history-year={row.year}>
              <td className='py-1.5 font-medium'>{row.year}</td>
              <td className='py-1.5 text-right'>{row.injuries}</td>
              {hasOsha ? (
                <>
                  <td className='py-1.5 text-right'>{row.recordables ?? '—'}</td>
                  <td className='py-1.5 text-right'>{row.dart ?? '—'}</td>
                  <td className='py-1.5 text-right'>{row.daysAway ?? '—'}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  </Card>
)

export const InspectionsBySiteBlock = ({ rows }: { rows: NonNullable<DashboardData['inspectionsBySite']> }) => (
  <Card className='h-full' data-testid='dashboard-inspections-by-site'>
    <CardHeader>
      <CardTitle>Inspections by Location</CardTitle>
      <CardDescription>Inspections started in the last 12 months.</CardDescription>
    </CardHeader>
    <CardContent>
      <BarList rows={rows} empty='No inspections in the last 12 months.' />
    </CardContent>
  </Card>
)

export const WorkspaceBlock = ({ modules }: { modules: EffectiveExperienceElement[] }) => (
  <Card className='h-full' data-testid='dashboard-workspace'>
    <CardHeader>
      <CardTitle>My Workspace</CardTitle>
      <CardDescription>Your modules.</CardDescription>
    </CardHeader>
    <CardContent>
      {modules.length ? (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {modules.map(module => (
            <div key={module.id} className='border-border flex items-start gap-3 rounded-lg border p-3' data-workspace-module={module.key}>
              <div className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
                <TbLayoutDashboard className='text-xl' />
              </div>
              <div className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='font-semibold'>{module.label}</span>
                <span className='text-textSecondary line-clamp-2 text-xs'>{module.description || 'Open this Forge module.'}</span>
                {module.routeLive && module.route ? (
                  <Link href={module.route} className='text-primary mt-1 inline-flex items-center gap-1 text-sm font-medium'>
                    Open <TbArrowRight />
                  </Link>
                ) : (
                  <span className='text-textSecondary mt-1 text-sm'>Coming soon</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className='text-textSecondary text-sm'>Your Forge Administrator controls which modules are available to your company and role.</p>
      )}
    </CardContent>
  </Card>
)
