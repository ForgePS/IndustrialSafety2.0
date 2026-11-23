import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { environmentalTabs } from '@/components/environmental/fields'
import { companyLocations, envRights, listPermits, todayIso } from '@/lib/forgeEnvironmental'
import { PERMIT_STATE_LABELS, permitState, permitTypeLabel } from '@/lib/forgeEnvironmentalRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental permits' }

const ALERT = new Set(['expired', 'expiring', 'not_yet'])

/** Port slice 17: the permit register, with expiry. */
const PermitsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('environmental.view')
  const organizationId = context.activeOrganization.id
  const archived = (await searchParams).archived === '1'
  const rights = await envRights(organizationId, context.user.id, context.access)
  const [permits, locations] = await Promise.all([listPermits({ organizationId, rights, archived }), companyLocations(organizationId)])
  const names = new Map(locations.map(location => [location.id, location.name]))
  const today = todayIso()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>Environmental permits</h1>
        {rights.manage && !archived ? (
          <Button asChild>
            <Link href='/environmental/permits/new'>Add permit</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={environmentalTabs} current='permits' label='Environmental Safety' />
      <nav className='flex gap-2 text-sm'>
        <Link href='/environmental/permits' aria-current={archived ? undefined : 'page'} className={'rounded-full border px-3 py-1 ' + (archived ? 'text-textSecondary' : 'border-primary text-primary')}>
          Current
        </Link>
        <Link href='/environmental/permits?archived=1' aria-current={archived ? 'page' : undefined} className={'rounded-full border px-3 py-1 ' + (archived ? 'border-primary text-primary' : 'text-textSecondary')}>
          Archived
        </Link>
      </nav>
      {permits.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-permit-list>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Permit</th>
                  <th className='px-4 py-2 font-semibold'>Type</th>
                  <th className='px-4 py-2 font-semibold'>Agency</th>
                  <th className='px-4 py-2 font-semibold'>Location</th>
                  <th className='px-4 py-2 font-semibold'>Expires</th>
                  <th className='px-4 py-2 font-semibold'>Standing</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((permit: any) => {
                  const state = permitState(permit, today)

                  return (
                    <tr key={permit.id} className='border-b last:border-0' data-permit={permit.title}>
                      <td className='px-4 py-2'>
                        <Link href={'/environmental/permits/' + permit.id} className='text-primary font-medium hover:underline'>
                          {permit.title}
                        </Link>
                        {permit.permit_number ? <p className='text-textSecondary text-xs'>{permit.permit_number}</p> : null}
                      </td>
                      <td className='px-4 py-2'>{permitTypeLabel(permit.permit_type)}</td>
                      <td className='px-4 py-2'>{permit.agency}</td>
                      <td className='px-4 py-2'>{names.get(permit.location_id) || 'Unknown'}</td>
                      <td className='px-4 py-2'>{permit.expires_on || '—'}</td>
                      <td className={'px-4 py-2 ' + (ALERT.has(state) ? 'text-warning font-semibold' : '')} data-permit-state={state}>
                        {PERMIT_STATE_LABELS[state]}
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
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{archived ? 'Nothing is archived.' : 'No permits recorded yet.'}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default PermitsPage
