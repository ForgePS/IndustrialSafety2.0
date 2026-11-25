import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import { companyLocations, forkliftRights, listOperators, viewGrant } from '@/lib/forgeForkliftAccess'
import { matchesStanding, operatorStandings, STANDING_FILTERS } from '@/lib/forgeForkliftOperators'
import { formatDate, isTruckClass, STANDING_LABELS, standingTone, TRUCK_CLASS_INFO, TRUCK_CLASSES } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklift operators' }

/** Port slice 19: trained, evaluated and authorized operators, with standing, class, location and text filters. */
const OperatorListPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)

  if (!viewGrant(rights)) redirect('/dashboard')

  const query = await searchParams
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '')
  const standingFilter = one('standing') in STANDING_FILTERS ? one('standing') : ''
  const classFilter = isTruckClass(one('class')) ? one('class') : ''
  const locationId = one('location')
  const search = one('q').trim().toLowerCase()

  const [operators, locations] = await Promise.all([listOperators({ organizationId, rights }), companyLocations(organizationId)])
  const { standings, settings } = await operatorStandings(organizationId, operators)
  const names = new Map(locations.map(location => [location.id, location.name]))

  const rows = operators.filter(
    operator =>
      matchesStanding(standings.get(operator.id) || 'none', standingFilter) &&
      (!classFilter || operator.truck_classes.includes(classFilter)) &&
      (!locationId || operator.person.locationId === locationId) &&
      (!search || `${operator.person.name} ${operator.person.employeeNumber || ''} ${operator.evaluator_name}`.toLowerCase().includes(search))
  )

  const field = 'bg-background rounded-md border px-3 py-2 text-sm'

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Forklift operators</h1>
          <p className='text-textSecondary mt-2'>
            People trained, evaluated and authorized to operate powered industrial trucks, by class. Evaluations are good for {settings.evaluation_months} months; reminders go out{' '}
            {settings.expiry_notice_days} days ahead.
          </p>
        </div>
        {rights.authorize ? (
          <Button asChild>
            <Link href='/forklifts/operators/new' data-authorize-operator>
              Authorize an operator
            </Link>
          </Button>
        ) : null}
      </div>
      <ForkliftTabs active='operators' canManage={Boolean(rights.manage)} />
      <form method='get' className='flex flex-wrap items-end gap-2' data-operator-filters>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Standing
          <select name='standing' defaultValue={standingFilter} className={field}>
            <option value=''>All</option>
            {Object.entries(STANDING_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-xs font-medium'>
          Class
          <select name='class' defaultValue={classFilter} className={field}>
            <option value=''>All</option>
            {TRUCK_CLASSES.map(value => (
              <option key={value} value={value}>
                {TRUCK_CLASS_INFO[value].label}
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
          <input name='q' defaultValue={one('q')} placeholder='Name, employee # or evaluator' className={field} />
        </label>
        <Button type='submit' variant='outline' size='sm'>
          Filter
        </Button>
      </form>
      {rows.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-operator-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Operator</th>
                  <th className='px-4 py-2 font-semibold'>Employee #</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Classes</th>
                  <th className='px-4 py-2 font-semibold'>Evaluated</th>
                  <th className='px-4 py-2 font-semibold'>Expires</th>
                  <th className='px-4 py-2 font-semibold'>Standing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(operator => {
                  const standing = standings.get(operator.id) || 'none'

                  return (
                    <tr key={operator.id} className='border-b last:border-0' data-operator-row={operator.person.name}>
                      <td className='px-4 py-2'>
                        <Link href={`/forklifts/operators/${operator.id}`} className='text-primary font-medium hover:underline'>
                          {operator.person.name}
                        </Link>
                      </td>
                      <td className='px-4 py-2'>{operator.person.employeeNumber || ''}</td>
                      <td className='px-4 py-2'>{names.get(operator.person.locationId || '') || 'No location'}</td>
                      <td className='px-4 py-2'>{operator.truck_classes.join(', ')}</td>
                      <td className='px-4 py-2'>{formatDate(operator.evaluated_on)}</td>
                      <td className='px-4 py-2'>{formatDate(operator.expires_on)}</td>
                      <td className='px-4 py-2'>
                        <Badge variant={standingTone(standing)} data-operator-standing={standing}>
                          {STANDING_LABELS[standing]}
                        </Badge>
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
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{operators.length ? 'No operators match.' : 'No operators are authorized yet.'}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default OperatorListPage
