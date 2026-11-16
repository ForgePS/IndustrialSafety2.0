import type { Metadata } from 'next'
import { TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill from '@/components/dot/DotStatusPill'
import { getDotSettings, getScopedDriverFiles } from '@/lib/forgeDot'
import { buildReportRow, reportColumns, reportStatsLine, reportTotals } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DOT Reports' }

const CELL_CLASS: Record<string, string> = {
  on_file: 'text-emerald-700 dark:text-emerald-400',
  expired: 'text-red-600 font-semibold',
  missing: 'text-red-600',
  expiring: 'text-amber-600 font-semibold',
  optional: 'text-textSecondary',
  na: 'text-textSecondary'
}

const SEVERITY: Record<string, { tone: 'critical' | 'pending' | 'ok'; label: string }> = {
  critical: { tone: 'critical', label: 'Critical' },
  warning: { tone: 'pending', label: 'Warning' },
  ok: { tone: 'ok', label: 'OK' }
}

const DotReportsPage = async () => {
  const context = await requireTenantPermission('dot.export')
  const organizationId = context.activeOrganization.id

  const [files, settings] = await Promise.all([
    getScopedDriverFiles({ organizationId, userId: context.user.id, permission: context.permission }),
    getDotSettings(organizationId)
  ])

  const hidden = settings.hidden_document_types
  const columns = reportColumns(hidden)

  const rows = files
    .map(file => ({
      id: file.id,
      ...buildReportRow(
        { name: file.name, employeeNumber: file.person?.employee_number || '', location: file.person?.locations?.name || '' },
        file.worksheet,
        hidden
      )
    }))
    .sort((a, b) => ['critical', 'warning', 'ok'].indexOf(a.severity) - ['critical', 'warning', 'ok'].indexOf(b.severity) || a.name.localeCompare(b.name))

  const totals = reportTotals(rows)

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='reports'
        allowed={allowedFrom(context)}
        actions={
          <Button asChild>
            {/* A file download, not a page: a plain anchor keeps the browser from client-routing it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href='/api/dot/compliance-report' download>
              <TbDownload />
              Download CSV
            </a>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>DQF compliance report</CardTitle>
          <CardDescription data-report-stats>{reportStatsLine(totals)}</CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {rows.length ? null : <p className='text-textSecondary py-6 text-center text-sm'>No open driver files.</p>}
          <table hidden={!rows.length} className='w-full min-w-max border-collapse text-xs'>
            <thead>
              <tr className='border-b text-left'>
                <th className='bg-card sticky left-0 py-2 pr-4 font-semibold'>Driver</th>
                <th className='py-2 pr-4 font-semibold'>Severity</th>
                {columns.map(column => (
                  <th key={column.key} className='max-w-36 py-2 pr-4 align-bottom font-semibold'>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                  <tr key={row.id} className='border-b' data-report-row={row.name}>
                    <td className='bg-card sticky left-0 py-2 pr-4'>
                      <a className='font-semibold hover:underline' href={'/dot/drivers/' + row.id}>
                        {row.name}
                      </a>
                      <div className='text-textSecondary'>{[row.employeeNumber && '#' + row.employeeNumber, row.location].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className='py-2 pr-4'>
                      <DotStatusPill tone={SEVERITY[row.severity].tone}>{SEVERITY[row.severity].label}</DotStatusPill>
                    </td>
                    {row.cells.map(cell => (
                      <td key={cell.key} className={'max-w-36 py-2 pr-4 ' + (CELL_CLASS[cell.status] || '')}>
                        {cell.text}
                        {cell.copies ? <span className='text-textSecondary'> · {cell.copies} {cell.copies === 1 ? 'copy' : 'copies'}</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

export default DotReportsPage
