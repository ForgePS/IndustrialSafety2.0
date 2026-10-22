import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbChartBar, TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { formatDuration, label, priorityLabels, statusLabels } from '@/lib/forgeHelpdesk'
import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { ANALYTICS_RANGES, getHelpdeskAnalytics, resolveAnalyticsRange } from '@/lib/forgeHelpdeskData'
import { listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'

export const metadata: Metadata = { title: 'Help Desk Analytics' }

const Breakdown = ({ title, items, format }: { title: string; items: any[]; format?: (key: string) => string }) => {
  const max = Math.max(1, ...items.map(i => i.count))

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-2 text-sm'>
        {items.length ? (
          items.map((item, index) => {
            const text = item.label ?? (item.module ? `${item.module} / ${item.category}` : format ? format(item.key) : item.key)

            return (
              <div key={index} className='flex flex-col gap-1'>
                <div className='flex justify-between gap-2'>
                  <span className='truncate'>{text}</span>
                  <span className='text-textSecondary'>{item.count}</span>
                </div>
                <div className='bg-muted h-1.5 rounded-full' aria-hidden>
                  <div className='bg-primary h-1.5 rounded-full' style={{ width: `${(item.count / max) * 100}%` }} />
                </div>
              </div>
            )
          })
        ) : (
          <p className='text-textSecondary'>No data in this range.</p>
        )}
      </CardContent>
    </Card>
  )
}

const AnalyticsPage = async ({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; tenant?: string }> }) => {
  const staff = await requireHelpdeskStaff('helpdesk.analytics.view')
  const params = await searchParams
  const range = resolveAnalyticsRange(params.range, params.from, params.to)
  const [data, tenants] = await Promise.all([getHelpdeskAnalytics({ from: range.from, to: range.to, organizationId: params.tenant }), listTenantOptions()])
  const query = new URLSearchParams()

  query.set('range', range.key)

  if (range.key === 'custom') {
    query.set('from', params.from || '')
    query.set('to', params.to || '')
  }

  if (params.tenant) query.set('tenant', params.tenant)
  const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`)

  const metrics = [
    { label: 'Tickets created', value: data.created },
    { label: 'Tickets resolved', value: data.resolved },
    { label: 'Open now', value: data.open },
    { label: 'Avg first response', value: formatDuration(data.first_response_minutes_avg) },
    { label: 'Mean time to assign', value: formatDuration(data.mtta_minutes_avg) },
    { label: 'Mean time to resolve', value: formatDuration(data.mttr_minutes_avg) },
    { label: 'SLA compliance', value: pct(data.sla_compliance_percent) },
    { label: 'SLA breaches', value: data.sla_breach_count_in_range },
    { label: 'Reopen rate', value: pct(data.reopen_rate_percent) },
    { label: 'Duplicate rate', value: pct(data.duplicate_rate_percent) },
    { label: 'Known issues', value: data.known_issue_count },
    { label: 'Feature requests', value: data.feature_request_count },
    { label: 'CSAT', value: data.csat_average ? `${data.csat_average} / 5 (${data.csat_responses})` : '—' }
  ]

  const daily: any[] = data.daily || []
  const dailyMax = Math.max(1, ...daily.map(d => Math.max(d.created, d.resolved)))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbChartBar />
            Help Desk analytics
          </h1>
          <p className='text-textSecondary mt-1'>
            {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()}
            {params.tenant ? ' · ' + (tenants.find(t => t.id === params.tenant)?.name || 'tenant') : ' · all tenants'}
          </p>
        </div>
        {staff.has('helpdesk.analytics.export') ? (
          <Button asChild variant='outline'>
            <a href={`${process.env.BASEPATH || ''}/api/helpdesk/export/analytics?${query.toString()}`}>
              <TbDownload />
              Export CSV
            </a>
          </Button>
        ) : null}
      </div>

      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap gap-2'>
          {ANALYTICS_RANGES.filter(r => r.key !== 'custom').map(r => (
            <Button key={r.key} asChild size='sm' variant={range.key === r.key ? 'tonal' : 'outline'}>
              <Link href={`/help-desk/console/analytics?range=${r.key}${params.tenant ? '&tenant=' + params.tenant : ''}`}>{r.label}</Link>
            </Button>
          ))}
        </div>
        <Form action='/help-desk/console/analytics' className='flex flex-wrap items-center gap-2'>
          <input type='hidden' name='range' value='custom' />
          <Input type='date' name='from' defaultValue={params.from || ''} aria-label='From date' className='w-auto' />
          <Input type='date' name='to' defaultValue={params.to || ''} aria-label='To date' className='w-auto' />
          <select name='tenant' defaultValue={params.tenant || ''} aria-label='Tenant' className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
            <option value=''>All tenants</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button type='submit' variant='outline'>
            Apply custom range
          </Button>
        </Form>
      </div>

      <div className='grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7'>
        {metrics.map(m => (
          <Card key={m.label}>
            <CardContent className='p-4'>
              <p className='text-textSecondary text-xs font-medium'>{m.label}</p>
              <p className='mt-1 text-xl font-bold'>{m.value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Created vs resolved per day</CardTitle>
        </CardHeader>
        <CardContent>
          {daily.length ? (
            <div className='flex h-40 items-end gap-1 overflow-x-auto' role='img' aria-label='Daily created and resolved tickets'>
              {daily.map(d => (
                <div key={d.day} className='flex min-w-[10px] flex-1 items-end gap-px' title={`${d.day}: ${d.created} created, ${d.resolved} resolved`}>
                  <div className='bg-primary flex-1 rounded-t' style={{ height: `${(d.created / dailyMax) * 100}%` }} />
                  <div className='bg-success flex-1 rounded-t' style={{ height: `${(d.resolved / dailyMax) * 100}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <p className='text-textSecondary text-sm'>No activity.</p>
          )}
          <p className='text-textSecondary mt-2 flex gap-4 text-xs'>
            <span className='flex items-center gap-1'>
              <span className='bg-primary inline-block size-2 rounded-full' /> Created
            </span>
            <span className='flex items-center gap-1'>
              <span className='bg-success inline-block size-2 rounded-full' /> Resolved
            </span>
          </p>
        </CardContent>
      </Card>

      <div className='grid gap-6 md:grid-cols-2 xl:grid-cols-3'>
        <Breakdown title='By status' items={data.by_status || []} format={key => label(statusLabels, key)} />
        <Breakdown title='By priority' items={data.by_priority || []} format={key => label(priorityLabels, key)} />
        <Breakdown title='By tenant' items={data.by_tenant || []} />
        <Breakdown title='By product area' items={data.by_module || []} />
        <Breakdown title='By request type' items={data.by_category || []} />
        <Breakdown title='By assignee' items={data.by_assignee || []} />
        <Breakdown title='Top recurring issues' items={data.top_recurring || []} />
      </div>
    </div>
  )
}

export default AnalyticsPage
