import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import { REPORT_PRESETS, type ReportColumn, type ReportDefinitionMeta, type ReportParams, type ReportPeriod } from '@/lib/forgeReportRules'

const field = 'bg-background rounded-md border px-2 py-1 text-sm'

/**
 * Port slice 13: the report's filters as a plain GET form, so every choice is in the URL (shareable, and what
 * the export links and "Save" use). Works without JavaScript.
 */
const ReportFilters = ({
  action,
  meta,
  params,
  period,
  visible,
  locations,
  hidden = {}
}: {
  action: string
  meta: ReportDefinitionMeta
  params: ReportParams
  period: ReportPeriod
  visible: ReportColumn[]
  locations: { id: string; name: string }[]
  hidden?: Record<string, string>
}) => {
  const year = params.year || new Date().getUTCFullYear()
  const chosen = new Set(params.columns?.length ? params.columns : visible.map(column => column.key))
  const groupable = visible.filter(column => meta.groupable.includes(column.key))

  return (
    <Card>
      <CardContent className='p-5'>
        <form method='get' action={action} className='flex flex-col gap-4' data-report-filters>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type='hidden' name={name} value={value} />
          ))}
          <div className='flex flex-wrap items-end gap-3'>
            {meta.usesYear ? (
              <label className='flex flex-col gap-1 text-xs'>
                Year
                <input type='number' name='year' min={2000} max={new Date().getUTCFullYear() + 1} defaultValue={year} className={field + ' w-24'} />
              </label>
            ) : null}
            {meta.dateLabel ? (
              <>
                <label className='flex flex-col gap-1 text-xs'>
                  {meta.dateLabel}
                  <select name='preset' defaultValue={period.preset} className={field}>
                    {REPORT_PRESETS.map(item => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='flex flex-col gap-1 text-xs'>
                  From (custom)
                  <input type='date' name='from' defaultValue={period.preset === 'custom' ? period.from || '' : ''} className={field} />
                </label>
                <label className='flex flex-col gap-1 text-xs'>
                  To (custom)
                  <input type='date' name='to' defaultValue={period.preset === 'custom' ? period.to || '' : ''} className={field} />
                </label>
              </>
            ) : null}
            {locations.length ? (
              <label className='flex flex-col gap-1 text-xs'>
                Location
                <select name='locationId' defaultValue={params.locationId || ''} className={field}>
                  <option value=''>All locations</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {meta.statuses?.length ? (
              <label className='flex flex-col gap-1 text-xs'>
                Status
                <select name='status' defaultValue={params.status || ''} className={field}>
                  <option value=''>Any status</option>
                  {meta.statuses.map(status => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {groupable.length ? (
              <label className='flex flex-col gap-1 text-xs'>
                Group by
                <select name='groupBy' defaultValue={params.groupBy || ''} className={field}>
                  <option value=''>No grouping (list every record)</option>
                  {groupable.map(column => (
                    <option key={column.key} value={column.key}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button type='submit' size='sm'>
              Run report
            </Button>
          </div>
          <details>
            <summary className='text-textSecondary cursor-pointer text-sm'>Columns</summary>
            <fieldset className='mt-3 flex flex-wrap gap-x-5 gap-y-2'>
              <legend className='sr-only'>Columns to show</legend>
              {visible.map(column => (
                <label key={column.key} className='flex items-center gap-2 text-sm'>
                  <input type='checkbox' name='columns' value={column.key} defaultChecked={chosen.has(column.key)} />
                  {column.label}
                </label>
              ))}
            </fieldset>
          </details>
        </form>
      </CardContent>
    </Card>
  )
}

export default ReportFilters
