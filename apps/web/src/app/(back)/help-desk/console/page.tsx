import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbDownload, TbHeadset } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { cn } from '@repo/ui/lib/utils'

import { HELPDESK_PRIORITIES, HELPDESK_STATUSES, label, priorityLabels, statusLabels } from '@/lib/forgeHelpdesk'
import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { CONSOLE_QUEUES, evaluateSlaIfStale, getConsoleScorecards, getHelpdeskCatalog, listAssignableStaff, listConsoleTickets } from '@/lib/forgeHelpdeskData'
import { listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'
import ConsoleTicketTable from './ConsoleTicketTable'

export const metadata: Metadata = { title: 'Support Console' }

type Search = { queue?: string; q?: string; tenant?: string; module?: string; category?: string; priority?: string; status?: string; assignee?: string; from?: string; to?: string }

const selectClass = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const ConsoleDashboard = async ({ searchParams }: { searchParams: Promise<Search> }) => {
  const staff = await requireHelpdeskStaff()
  const params = await searchParams

  await evaluateSlaIfStale()
  const queue = CONSOLE_QUEUES.some(q => q.key === params.queue) ? params.queue! : 'open'

  const [scorecards, tickets, catalog, people, tenants] = await Promise.all([
    getConsoleScorecards(staff.user.id),
    listConsoleTickets(staff, {
      queue,
      q: params.q,
      organizationId: params.tenant,
      moduleId: params.module,
      categoryId: params.category,
      priority: params.priority,
      status: params.status,
      assigneeId: params.assignee,
      from: params.from,
      to: params.to
    }),
    getHelpdeskCatalog(),
    listAssignableStaff(),
    listTenantOptions()
  ])

  const query = (next: Partial<Search>) => {
    const search = new URLSearchParams()

    Object.entries({ ...params, ...next }).forEach(([k, v]) => {
      if (v) search.set(k, v)
    })

    return search.toString()
  }

  const cards = [
    { label: 'Open', value: scorecards.openCount, queue: 'open' },
    { label: 'New today', value: scorecards.newToday, queue: 'all' },
    { label: 'Unassigned', value: scorecards.unassigned, queue: 'unassigned' },
    { label: 'Assigned to me', value: scorecards.mine, queue: 'mine' },
    { label: 'SLA breached', value: scorecards.breached, queue: 'breached', danger: scorecards.breached > 0 },
    { label: 'SLA at risk', value: scorecards.atRisk, queue: 'at_risk', warn: scorecards.atRisk > 0 },
    { label: 'P1 critical', value: scorecards.p1, queue: 'p1', danger: scorecards.p1 > 0 },
    { label: 'Waiting on customer', value: scorecards.waitingCustomer, queue: 'waiting_on_customer' },
    { label: 'Resolved today', value: scorecards.resolvedToday, queue: 'resolved' }
  ]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbHeadset />
            Support Console
          </h1>
          <p className='text-textSecondary mt-1'>Work the queue across every Forge tenant.</p>
        </div>
        {staff.has('helpdesk.analytics.export') ? (
          <Button asChild variant='outline'>
            <a href={`${process.env.BASEPATH || ''}/api/helpdesk/export/tickets?${query({ queue })}`}>
              <TbDownload />
              Export CSV
            </a>
          </Button>
        ) : null}
      </div>

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9'>
        {cards.map(card => (
          <Link key={card.label} href={`/help-desk/console?queue=${card.queue}`} className='focus-visible:ring-primary rounded-lg focus-visible:outline-none focus-visible:ring-2'>
            <Card className={cn('h-full transition-colors hover:border-primary', card.danger && 'border-destructive/50', card.warn && 'border-warning/50')}>
              <CardContent className='p-4'>
                <p className='text-textSecondary text-xs font-medium'>{card.label}</p>
                <p className={cn('mt-1 text-2xl font-bold', card.danger && 'text-destructive')}>{card.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <nav aria-label='Queues' className='flex flex-wrap gap-2'>
        {CONSOLE_QUEUES.map(q => (
          <Button key={q.key} asChild size='sm' variant={queue === q.key ? 'tonal' : 'outline'}>
            <Link href={`/help-desk/console?${query({ queue: q.key })}`}>{q.label}</Link>
          </Button>
        ))}
      </nav>

      <Card>
        <CardContent className='p-4'>
          <Form action='/help-desk/console' className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6'>
            <input type='hidden' name='queue' value={queue} />
            <Input name='q' defaultValue={params.q || ''} placeholder='Search text or SUP-…' aria-label='Search tickets' className='xl:col-span-2' maxLength={120} />
            <select name='tenant' defaultValue={params.tenant || ''} aria-label='Tenant' className={selectClass}>
              <option value=''>All tenants</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select name='module' defaultValue={params.module || ''} aria-label='Product area' className={selectClass}>
              <option value=''>All product areas</option>
              {catalog.areas.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <select name='category' defaultValue={params.category || ''} aria-label='Request type' className={selectClass}>
              <option value=''>All request types</option>
              {catalog.categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select name='priority' defaultValue={params.priority || ''} aria-label='Priority' className={selectClass}>
              <option value=''>Any priority</option>
              {HELPDESK_PRIORITIES.map(p => (
                <option key={p} value={p}>
                  {label(priorityLabels, p)}
                </option>
              ))}
            </select>
            <select name='status' defaultValue={params.status || ''} aria-label='Status' className={selectClass}>
              <option value=''>Any status</option>
              {HELPDESK_STATUSES.map(s => (
                <option key={s} value={s}>
                  {label(statusLabels, s)}
                </option>
              ))}
            </select>
            <select name='assignee' defaultValue={params.assignee || ''} aria-label='Assignee' className={selectClass}>
              <option value=''>Any assignee</option>
              <option value='none'>Unassigned</option>
              {people.map((p: any) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input type='date' name='from' defaultValue={params.from || ''} aria-label='Created from' />
            <Input type='date' name='to' defaultValue={params.to || ''} aria-label='Created to' />
            <div className='flex gap-2'>
              <Button type='submit'>Apply</Button>
              <Button asChild variant='ghost'>
                <Link href={`/help-desk/console?queue=${queue}`}>Clear</Link>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      <ConsoleTicketTable tickets={JSON.parse(JSON.stringify(tickets))} staff={people.map((p: any) => ({ user_id: p.user_id, name: p.name }))} canAssign={staff.has('helpdesk.support.assign')} />
    </div>
  )
}

export default ConsoleDashboard
