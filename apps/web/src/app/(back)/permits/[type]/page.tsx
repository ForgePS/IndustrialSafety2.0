import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import PermitTabs from '@/components/permits/PermitTabs'
import { formatWhen, timeLeftLabel } from '@/components/permits/format'
import { companyLocations, companyTimeZone, listPermits, permitRights } from '@/lib/forgePermitAccess'
import { isExpired, minutesLeft, PERMIT_STATUS_LABELS, PERMIT_STATUSES, PERMIT_TYPE_INFO, permitPath, permitStatusTone, permitTypeFromSlug } from '@/lib/forgePermitRules'
import type { PermitStatus } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Work permits' }

/** Port slice 18: the permits of one type, with status, location and text filters. */
const PermitListPage = async ({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const { type: slug } = await params
  const type = permitTypeFromSlug(slug)

  if (!type) notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)
  const query = await searchParams
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '')
  const status = (PERMIT_STATUSES as readonly string[]).includes(one('status')) ? one('status') : ''
  const locationId = one('location')
  const search = one('q').trim().toLowerCase()
  const expiredOnly = one('expired') === '1'

  const [rows, locations, timeZone] = await Promise.all([listPermits({ organizationId, rights, type, status: status || undefined }), companyLocations(organizationId), companyTimeZone(organizationId)])

  const names = new Map(locations.map(location => [location.id, location.name]))
  const now = new Date()

  const permits = (rows as any[]).filter(
    permit =>
      (!locationId || permit.location_id === locationId) &&
      (!search || `${permit.permit_number} ${permit.title} ${permit.work_area || ''}`.toLowerCase().includes(search)) &&
      (!expiredOnly || isExpired(permit, now))
  )

  const info = PERMIT_TYPE_INFO[type]
  const field = 'bg-background rounded-md border px-3 py-2 text-sm'

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>{info.label}</h1>
          <p className='text-textSecondary mt-2'>{info.description}</p>
        </div>
        {rights.request ? (
          <Button asChild>
            <Link href={permitPath(type) + '/new'} data-new-permit>
              New permit
            </Link>
          </Button>
        ) : null}
      </div>
      <PermitTabs active={slug} canManage={Boolean(rights.manage)} />
      <form method='get' className='flex flex-wrap items-end gap-2' data-permit-filters>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Status
          <select name='status' defaultValue={status} className={field}>
            <option value=''>All</option>
            {PERMIT_STATUSES.map(item => (
              <option key={item} value={item}>
                {PERMIT_STATUS_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Location
          <select name='location' defaultValue={locationId} className={field}>
            <option value=''>All</option>
            {locations.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Search
          <input name='q' defaultValue={one('q')} placeholder='Number, title or area' className={field} />
        </label>
        <label className='flex items-center gap-2 pb-2 text-sm'>
          <input type='checkbox' name='expired' value='1' defaultChecked={expiredOnly} />
          Past end time only
        </label>
        <Button type='submit' variant='outline' size='sm'>
          Filter
        </Button>
      </form>
      {permits.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-permit-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Permit</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Valid</th>
                  <th className='px-4 py-2 font-semibold'>Status</th>
                </tr>
              </thead>
              <tbody>
                {permits.map(permit => {
                  const expired = isExpired(permit, now)
                  const left = minutesLeft(permit, now)

                  return (
                    <tr key={permit.id} className='border-b last:border-0' data-permit-row={permit.permit_number}>
                      <td className='px-4 py-2'>
                        <Link href={permitPath(type, permit.id)} className='text-primary font-medium hover:underline'>
                          {permit.permit_number}
                        </Link>
                        <p>{permit.title}</p>
                        {permit.work_area ? <p className='text-textSecondary text-xs'>{permit.work_area}</p> : null}
                      </td>
                      <td className='px-4 py-2'>{names.get(permit.location_id) || 'Unknown'}</td>
                      <td className='px-4 py-2 text-xs'>
                        {formatWhen(permit.valid_from, timeZone)}
                        <br />
                        to {formatWhen(permit.valid_until, timeZone)}
                        {left !== null ? <p className={left < 60 ? 'text-error font-semibold' : 'text-textSecondary'}>{timeLeftLabel(left)}</p> : null}
                      </td>
                      <td className='px-4 py-2'>
                        <Badge variant={permitStatusTone(permit.status, expired)} data-permit-status={permit.status}>
                          {PERMIT_STATUS_LABELS[permit.status as PermitStatus] || permit.status}
                        </Badge>
                        {expired ? (
                          <p className='text-error mt-1 text-xs font-semibold' data-permit-expired>
                            Past its end time
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No permits match.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default PermitListPage
