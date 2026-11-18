import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbCode } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { developmentProviderLabels, developmentStateLabels, developmentTypeLabels, label } from '@/lib/forgeHelpdesk'
import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { listDevelopmentIssues } from '@/lib/forgeHelpdeskConsoleData'
import { listConfiguredDevelopmentProviders } from '@/lib/forgeHelpdeskDevelopment'
import { PriorityBadge } from '@/components/helpdesk/HelpdeskBadges'
import NewDevelopmentIssue from './NewDevelopmentIssue'

export const metadata: Metadata = { title: 'Development Issues' }

const FILTERS = ['open', 'all', 'fixed', 'released', 'closed']

const DevelopmentPage = async ({ searchParams }: { searchParams: Promise<{ state?: string; q?: string }> }) => {
  await requireHelpdeskStaff('helpdesk.support.link_development')
  const params = await searchParams
  const state = FILTERS.includes(params.state || '') ? params.state! : 'open'
  const issues = await listDevelopmentIssues({ state, q: params.q })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbCode />
            Development issues
          </h1>
          <p className='text-textSecondary mt-1'>Bugs, feature requests and known issues linked to customer tickets. Works with Forge internal tracking or an external tracker.</p>
        </div>
        <NewDevelopmentIssue providers={listConfiguredDevelopmentProviders()} />
      </div>

      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap gap-2'>
          {FILTERS.map(f => (
            <Button key={f} asChild size='sm' variant={state === f ? 'tonal' : 'outline'}>
              <Link href={`/help-desk/console/development?state=${f}`}>{f === 'open' ? 'Open' : f === 'all' ? 'All' : label(developmentStateLabels, f)}</Link>
            </Button>
          ))}
        </div>
        <Form action='/help-desk/console/development' className='flex gap-2'>
          <input type='hidden' name='state' value={state} />
          <Input name='q' defaultValue={params.q || ''} placeholder='Title or DEV-2026-0001' aria-label='Search development issues' maxLength={100} className='sm:w-64' />
          <Button type='submit' variant='outline'>
            Search
          </Button>
        </Form>
      </div>

      <Card>
        <CardContent className='flex flex-col divide-y p-0'>
          {issues.map((i: any) => (
            <Link key={i.id} href={`/help-desk/console/development/${i.id}`} className='hover:bg-muted/40 flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0'>
                <p className='truncate font-medium'>
                  <span className='text-textSecondary mr-2 font-mono text-sm'>{i.issue_number}</span>
                  {i.title}
                </p>
                <p className='text-textSecondary text-xs'>
                  {label(developmentTypeLabels, i.issue_type)} · {i.linked_tickets} ticket(s) · {i.affected_tenants} tenant(s)
                  {i.module?.label ? ' · ' + i.module.label : ''}
                  {i.fix_version ? ' · fix ' + i.fix_version : ''} · {label(developmentProviderLabels, i.external_provider)}
                  {i.external_issue_id ? ' #' + i.external_issue_id : ''}
                </p>
              </div>
              <div className='flex gap-2'>
                <PriorityBadge priority={i.priority} />
                <Badge size='sm' variant={['fixed', 'released'].includes(i.state) ? 'tonalSuccess' : 'outline'}>
                  {label(developmentStateLabels, i.state)}
                </Badge>
              </div>
            </Link>
          ))}
          {!issues.length ? <p className='text-textSecondary p-6 text-sm'>No development issues match.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default DevelopmentPage
