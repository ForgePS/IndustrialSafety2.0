import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { formatCell, type ReportResult } from '@/lib/forgeReportRules'

/** On screen the list stops here; the CSV has every row. */
export const SCREEN_ROWS = 500

/** Port slice 13: a report's rows, or its group counts and totals. */
const ReportTable = ({ result }: { result: ReportResult }) => {
  if (result.groupBy) {
    const numeric = Object.keys(result.groups[0]?.totals || {})
    const labels = new Map(result.columns.map(column => [column.key, column.label]))

    return (
      <Card>
        <CardHeader>
          <CardTitle>By {result.groupBy.label.toLowerCase()}</CardTitle>
          <CardDescription data-report-total>
            {result.total} {result.total === 1 ? 'record' : 'records'} in {result.groups.length} {result.groups.length === 1 ? 'group' : 'groups'}
          </CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {result.groups.length ? (
            <table className='w-full border-collapse text-sm' data-report-groups>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>{result.groupBy.label}</th>
                  <th className='py-2 pr-4 text-right font-semibold'>Count</th>
                  {numeric.map(key => (
                    <th key={key} className='py-2 pr-4 text-right font-semibold'>
                      Total {(labels.get(key) || key).toLowerCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.groups.map(group => (
                  <tr key={group.label} className='border-b' data-report-group={group.label}>
                    <td className='py-2 pr-4'>{group.label}</td>
                    <td className='py-2 pr-4 text-right tabular-nums'>{group.count}</td>
                    {numeric.map(key => (
                      <td key={key} className='py-2 pr-4 text-right tabular-nums'>
                        {group.totals[key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary py-6 text-center text-sm'>No records match these filters.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  const shown = result.rows.slice(0, SCREEN_ROWS)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription data-report-total>
          {result.total} {result.total === 1 ? 'record' : 'records'}
          {result.total > shown.length ? `; showing the first ${shown.length}. Download the CSV for all of them.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className='overflow-x-auto'>
        {shown.length ? (
          <table className='w-full border-collapse text-sm' data-report-rows>
            <thead>
              <tr className='border-b text-left'>
                {result.columns.map(column => (
                  <th key={column.key} className={'py-2 pr-4 font-semibold whitespace-nowrap ' + (column.type === 'number' ? 'text-right' : '')}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr key={index} className='border-b align-top'>
                  {result.columns.map(column => (
                    <td key={column.key} className={'py-2 pr-4 ' + (column.type === 'number' ? 'text-right tabular-nums' : '')}>
                      {formatCell(row[column.key] ?? null, column.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className='text-textSecondary py-6 text-center text-sm'>No records match these filters.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default ReportTable
