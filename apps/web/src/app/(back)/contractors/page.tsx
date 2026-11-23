import type { Metadata } from 'next'
import Link from 'next/link'
import { TbHelmet } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import StandingBadge from '@/components/contractors/StandingBadge'
import { contractorTabs } from '@/components/contractors/tabs'
import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { COMPANY_STATUSES, companyStatusLabel } from '@/lib/forgeContractorRules'
import { companyLocations, contractorRights, listCompanies, onSiteNow } from '@/lib/forgeContractors'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Contractor Safety' }

/** Port slice 15: contractor companies with approval and whether they're cleared to work. */
const ContractorsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('contractor_safety.view')
  const organizationId = context.activeOrganization.id
  const query = await searchParams
  const archived = query.archived === '1'
  const status = typeof query.status === 'string' && COMPANY_STATUSES.some(item => item.key === query.status) ? query.status : ''
  const rights = await contractorRights(organizationId, context.user.id, context.access)

  const [companies, locations, onSite] = await Promise.all([
    listCompanies({ organizationId, rights, includeArchived: archived }),
    companyLocations(organizationId),
    rights.signIn ? onSiteNow(organizationId, rights.signIn.locations) : Promise.resolve([])
  ])

  const names = new Map(locations.map(location => [location.id, location.name]))
  const shown = companies.filter((company: any) => (archived ? company.archived_at : true) && (!status || company.status === status))
  const filters = [{ key: '', label: 'All' }, ...COMPANY_STATUSES]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbHelmet />
            Contractor Safety
          </h1>
          <p className='text-textSecondary mt-2'>Approve contractor companies, keep their insurance and safety documents current, and sign their workers in on site.</p>
        </div>
        {rights.manage && !archived ? (
          <Button asChild>
            <Link href='/contractors/new'>Add company</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={contractorTabs({ canSignIn: Boolean(rights.signIn), canSettings: rights.settings })} current='companies' label='Contractor Safety' />
      {rights.signIn ? (
        <p className='text-sm' data-on-site-count>
          <Link href='/contractors/on-site' className='text-primary font-medium hover:underline'>
            {onSite.length} contractor{onSite.length === 1 ? '' : 's'} on site now
          </Link>
        </p>
      ) : null}
      <nav aria-label='Filter by status' className='flex flex-wrap gap-2 text-sm'>
        {filters.map(item => (
          <Link
            key={item.key || 'all'}
            href={'/contractors' + (item.key ? '?status=' + item.key : '')}
            aria-current={!archived && status === item.key ? 'page' : undefined}
            className={'rounded-full border px-3 py-1 ' + (!archived && status === item.key ? 'border-primary text-primary' : 'text-textSecondary')}
          >
            {item.label}
          </Link>
        ))}
        <Link href='/contractors?archived=1' aria-current={archived ? 'page' : undefined} className={'rounded-full border px-3 py-1 ' + (archived ? 'border-primary text-primary' : 'text-textSecondary')}>
          Archived
        </Link>
      </nav>
      {shown.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-contractor-companies>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>Company</th>
                  <th className='px-4 py-2 font-semibold'>Status</th>
                  <th className='px-4 py-2 font-semibold'>Cleared to work</th>
                  <th className='px-4 py-2 font-semibold'>Workers</th>
                  <th className='px-4 py-2 font-semibold'>Sites</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((company: any) => (
                  <tr key={company.id} className='border-b last:border-0' data-contractor-company={company.name}>
                    <td className='px-4 py-2'>
                      <Link href={'/contractors/' + company.id} className='text-primary font-medium hover:underline'>
                        {company.name}
                      </Link>
                      {company.trade ? <p className='text-textSecondary text-xs'>{company.trade}</p> : null}
                    </td>
                    <td className='px-4 py-2'>{companyStatusLabel(company.status)}</td>
                    <td className='px-4 py-2'>
                      <StandingBadge standing={company.standing} />
                    </td>
                    <td className='px-4 py-2'>{company.workerCount}</td>
                    <td className='px-4 py-2'>{company.location_ids.length ? company.location_ids.map((id: string) => names.get(id) || 'Unknown').join(', ') : 'Any site'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>{archived ? 'Nothing is archived.' : 'No contractor companies yet.'}</CardContent>
        </Card>
      )}
    </div>
  )
}

export default ContractorsPage
