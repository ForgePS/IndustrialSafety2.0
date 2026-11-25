import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import { formatWhen } from '@/components/permits/format'
import { companyTimeZone, forkliftRights, listChecksInScope, listTrucks } from '@/lib/forgeForkliftAccess'
import { isUuid, todayIn } from '@/lib/forgeForkliftRules'
import { localDateTimeToIso } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Pre-shift checks' }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const SHOWN = 500

/** Port slice 19: pre-shift checks across the trucks in scope, with truck, result and date filters (company time zone). */
const ChecksPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const query = await searchParams
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '')
  const timeZone = await companyTimeZone(organizationId)
  const today = todayIn(timeZone)
  const truckId = isUuid(one('truck')) ? one('truck') : ''
  const result = one('result') === 'pass' || one('result') === 'fail' ? one('result') : ''
  const from = DATE.test(one('from')) ? one('from') : ''
  const to = DATE.test(one('to')) ? one('to') : ''
  const since = from ? localDateTimeToIso(`${from}T00:00`, timeZone) : localDateTimeToIso(`${todayIn(timeZone, new Date(Date.now() - 30 * 86400_000))}T00:00`, timeZone)
  const dayAfter = to ? new Date(Date.parse(to + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10) : ''
  const until = dayAfter ? new Date(localDateTimeToIso(`${dayAfter}T00:00`, timeZone) as string) : null

  const [rows, trucks] = await Promise.all([listChecksInScope({ organizationId, rights, since: since || undefined, result: result || undefined }), listTrucks({ organizationId, rights, includeRetired: true })])
  const names = new Map(trucks.map(truck => [truck.id, truck.asset.name]))
  const checks = (rows as any[]).filter(check => (!truckId || check.forklift_id === truckId) && (!until || new Date(check.performed_at) < until))
  const field = 'bg-background rounded-md border px-3 py-2 text-sm'

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Pre-shift checks</h1>
        <p className='text-textSecondary mt-2'>Forklifts are examined before use, at least daily (1910.178(q)(7)). {from ? '' : 'Showing the last 30 days.'}</p>
      </div>
      <ForkliftTabs active='checks' canManage={Boolean(rights.manage)} />
      <form method='get' className='flex flex-wrap items-end gap-2' data-check-filters>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Truck
          <select name='truck' defaultValue={truckId} className={field}>
            <option value=''>All</option>
            {trucks.map(truck => (
              <option key={truck.id} value={truck.id}>
                {truck.asset.name}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Result
          <select name='result' defaultValue={result} className={field}>
            <option value=''>All</option>
            <option value='pass'>Passed</option>
            <option value='fail'>Failed</option>
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          From
          <input type='date' name='from' defaultValue={from} max={today} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          To
          <input type='date' name='to' defaultValue={to} max={today} className={field} />
        </label>
        <Button type='submit' variant='outline' size='sm'>
          Filter
        </Button>
      </form>
      {checks.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-check-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>When</th>
                  <th className='px-4 py-2 font-semibold'>Truck</th>
                  <th className='px-4 py-2 font-semibold'>Operator</th>
                  <th className='px-4 py-2 font-semibold'>Result</th>
                </tr>
              </thead>
              <tbody>
                {checks.slice(0, SHOWN).map(check => (
                  <tr key={check.id} className='border-b last:border-0' data-check-row={names.get(check.forklift_id) || ''}>
                    <td className='px-4 py-2'>
                      <Link href={'/forklifts/checks/' + check.id} className='text-primary hover:underline'>
                        {formatWhen(check.performed_at, timeZone)}
                      </Link>
                    </td>
                    <td className='px-4 py-2'>
                      <Link href={'/forklifts/trucks/' + check.forklift_id} className='hover:underline'>
                        {names.get(check.forklift_id) || 'Unknown'}
                      </Link>
                    </td>
                    <td className='px-4 py-2'>{check.operator_name}</td>
                    <td className='px-4 py-2' data-check-result={check.result}>
                      <span className={check.result === 'fail' ? 'text-error font-semibold' : ''}>{check.result === 'pass' ? 'Passed' : 'Failed'}</span>
                      {check.took_out_of_service ? <span className='text-error text-xs'> · taken out of service</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {checks.length > SHOWN ? <p className='text-textSecondary p-4 text-sm'>Showing the latest {SHOWN} of {checks.length}. Narrow the dates to see more.</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No checks match.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default ChecksPage
