import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { environmentalTabs } from '@/components/environmental/fields'
import ObligationTable from '@/components/environmental/ObligationTable'
import { envRights, listObligations } from '@/lib/forgeEnvironmental'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental obligations' }

/** Port slice 17: every recurring obligation, soonest due first. */
const ObligationsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('environmental.view')
  const organizationId = context.activeOrganization.id
  const all = (await searchParams).all === '1'
  const rights = await envRights(organizationId, context.user.id, context.access)
  const obligations = await listObligations({ organizationId, rights, includeInactive: all })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Environmental obligations</h1>
          <p className='text-textSecondary mt-2'>Monitoring, agency reports, inspections and renewals, with a record of each one done.</p>
        </div>
        {rights.manage ? (
          <Button asChild>
            <Link href='/environmental/obligations/new'>Add obligation</Link>
          </Button>
        ) : null}
      </div>
      <EmergencyTabs tabs={environmentalTabs} current='obligations' label='Environmental Safety' />
      <nav className='flex gap-2 text-sm'>
        <Link href='/environmental/obligations' aria-current={all ? undefined : 'page'} className={'rounded-full border px-3 py-1 ' + (all ? 'text-textSecondary' : 'border-primary text-primary')}>
          Active
        </Link>
        <Link href='/environmental/obligations?all=1' aria-current={all ? 'page' : undefined} className={'rounded-full border px-3 py-1 ' + (all ? 'border-primary text-primary' : 'text-textSecondary')}>
          Include paused and done
        </Link>
      </nav>
      <Card>
        <CardContent className='overflow-x-auto p-4'>
          <ObligationTable obligations={obligations} empty='No obligations yet.' showPermit />
        </CardContent>
      </Card>
    </div>
  )
}

export default ObligationsPage
