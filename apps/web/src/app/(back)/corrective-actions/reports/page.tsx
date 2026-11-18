import type { Metadata } from 'next'
import Link from 'next/link'
import { TbArrowLeft, TbDownload, TbReportAnalytics } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { getCapaReportData } from '@/lib/forgeCapaReport'
import {
  CAPA_REPORT_BREAKDOWNS,
  CAPA_REPORT_PRESETS,
  capaReportBreakdown,
  capaReportMetrics,
  capaReportQuery,
  resolveCapaReportPeriod
} from '@/lib/forgeCapaReportRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Corrective Action Reports' }

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const pct = (value: number | null) => (value === null ? '—' : value + '%')

const CorrectiveActionReportsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('corrective_actions.view')
  const params = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const period = resolveCapaReportPeriod({ preset: first(params.preset), from: first(params.from), to: first(params.to) }, today)

  const { records, labels } = await getCapaReportData({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    permission: context.permission
  })

  const metrics = capaReportMetrics(records, period, today)

  const tiles = [
    { key: 'opened', label: 'Opened', value: String(metrics.opened), hint: 'Created in the period' },
    { key: 'closed', label: 'Closed', value: String(metrics.closed), hint: 'Closed in the period' },
    {
      key: 'on-time',
      label: 'Closed on time',
      value: pct(metrics.onTimePct),
      hint: metrics.closedWithDue ? `${metrics.closedOnTime} of ${metrics.closedWithDue} with a due date` : 'Nothing with a due date closed'
    },
    { key: 'open-now', label: 'Open now', value: String(metrics.openNow), hint: 'Not closed or canceled' },
    { key: 'overdue-now', label: 'Overdue now', value: String(metrics.overdueNow), hint: 'Open and past due' },
    {
      key: 'avg-days',
      label: 'Avg days to close',
      value: metrics.avgDaysToClose === null ? '—' : String(metrics.avgDaysToClose),
      hint: 'Created to closed'
    }
  ]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <Link href='/corrective-actions' className='text-textSecondary mb-2 inline-flex items-center gap-1 text-sm hover:underline'>
            <TbArrowLeft />
            Corrective Actions
          </Link>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbReportAnalytics />
            Corrective Action Reports
          </h1>
          <p className='text-textSecondary mt-2' data-capa-report-period>
            {period.label} · {period.from} to {period.to}
          </p>
        </div>
        <Button asChild>
          {/* A file download, not a page: a plain anchor keeps the browser from client-routing it. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href={'/corrective-actions/reports/export?' + capaReportQuery(period)} download>
            <TbDownload />
            Download CSV
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className='flex flex-wrap items-end gap-4 p-5'>
          <nav aria-label='Report period' className='flex flex-wrap gap-2'>
            {CAPA_REPORT_PRESETS.filter(item => item.key !== 'custom').map(item => (
              <Button key={item.key} asChild size='sm' variant={period.preset === item.key ? 'default' : 'outline'}>
                <Link href={'/corrective-actions/reports?preset=' + item.key} aria-current={period.preset === item.key ? 'page' : undefined}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
          <form method='get' action='/corrective-actions/reports' className='flex flex-wrap items-end gap-2'>
            <input type='hidden' name='preset' value='custom' />
            <label className='flex flex-col gap-1 text-xs'>
              From
              <input type='date' name='from' required defaultValue={period.from} className='bg-background rounded-md border px-2 py-1 text-sm' />
            </label>
            <label className='flex flex-col gap-1 text-xs'>
              To
              <input type='date' name='to' required defaultValue={period.to} className='bg-background rounded-md border px-2 py-1 text-sm' />
            </label>
            <Button type='submit' size='sm' variant={period.preset === 'custom' ? 'default' : 'outline'}>
              Apply custom range
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
        {tiles.map(tile => (
          <Card key={tile.key} data-capa-tile={tile.key}>
            <CardContent className='p-5'>
              <div className='text-textSecondary text-sm'>{tile.label}</div>
              <div className='text-textPrimary mt-1 text-3xl font-bold' data-capa-tile-value>
                {tile.value}
              </div>
              <div className='text-textSecondary mt-1 text-xs'>{tile.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-6 xl:grid-cols-2'>
        {CAPA_REPORT_BREAKDOWNS.map(breakdown => {
          const rows = capaReportBreakdown(records, breakdown.key, period, today, labels)

          return (
            <Card key={breakdown.key} data-capa-breakdown={breakdown.key}>
              <CardHeader>
                <CardTitle>{breakdown.label}</CardTitle>
                <CardDescription>Opened and closed in the period; open and overdue as of today.</CardDescription>
              </CardHeader>
              <CardContent className='overflow-x-auto'>
                {rows.length ? (
                  <table className='w-full border-collapse text-sm'>
                    <thead>
                      <tr className='border-b text-left'>
                        <th className='py-2 pr-4 font-semibold'>{breakdown.label.replace(/^By /, '').replace(/^./, c => c.toUpperCase())}</th>
                        <th className='py-2 pr-4 text-right font-semibold'>Opened</th>
                        <th className='py-2 pr-4 text-right font-semibold'>Closed</th>
                        <th className='py-2 pr-4 text-right font-semibold'>On time</th>
                        <th className='py-2 pr-4 text-right font-semibold'>Open</th>
                        <th className='py-2 text-right font-semibold'>Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.label} className='border-b' data-capa-breakdown-row={row.label}>
                          <td className='py-2 pr-4'>{row.label}</td>
                          <td className='py-2 pr-4 text-right tabular-nums'>{row.opened}</td>
                          <td className='py-2 pr-4 text-right tabular-nums'>{row.closed}</td>
                          <td className='py-2 pr-4 text-right tabular-nums'>{pct(row.onTimePct)}</td>
                          <td className='py-2 pr-4 text-right tabular-nums'>{row.openNow}</td>
                          <td className={'py-2 text-right tabular-nums ' + (row.overdueNow ? 'font-semibold text-red-600' : '')}>{row.overdueNow}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className='text-textSecondary py-6 text-center text-sm'>No corrective actions in this period.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default CorrectiveActionReportsPage
