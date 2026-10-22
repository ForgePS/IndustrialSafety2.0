import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbPlus, TbSearch, TbTicket } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { listCustomerTickets } from '@/lib/forgeHelpdeskData'
import { StatusBadge } from '@/components/helpdesk/HelpdeskBadges'

export const metadata: Metadata = { title: 'My Tickets' }

const FILTERS = [
  { key: 'active', label: 'Open' },
  { key: 'waiting_on_customer', label: 'Waiting on me' },
  { key: 'closed', label: 'Resolved & closed' },
  { key: 'all', label: 'All' }
]

const TicketsPage = async ({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; scope?: string }> }) => {
  const access = await requireHelpdeskCustomer('helpdesk.ticket.view_own')
  const params = await searchParams
  const status = FILTERS.some(f => f.key === params.status) ? params.status! : 'active'
  const mineOnly = params.scope === 'mine'
  const { tickets, canSeeOthers } = await listCustomerTickets(access, { status, q: params.q || '', mineOnly })

  const href = (next: Record<string, string | undefined>) => {
    const query = new URLSearchParams()
    const merged = { status, q: params.q, scope: params.scope, ...next }

    Object.entries(merged).forEach(([k, v]) => v && query.set(k, v))

    return '/help-desk/tickets?' + query.toString()
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbTicket />
            {canSeeOthers && !mineOnly ? 'Support tickets' : 'My tickets'}
          </h1>
          <p className='text-textSecondary mt-1'>{canSeeOthers ? `Tickets you submitted, follow, or can see for ${access.organizationName}.` : 'Tickets you submitted or follow.'}</p>
        </div>
        {access.has('helpdesk.ticket.create') ? (
          <Button asChild>
            <Link href='/help-desk/tickets/new'>
              <TbPlus />
              Submit a ticket
            </Link>
          </Button>
        ) : null}
      </div>

      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap gap-2'>
          {FILTERS.map(f => (
            <Button key={f.key} asChild size='sm' variant={status === f.key ? 'tonal' : 'outline'}>
              <Link href={href({ status: f.key })}>{f.label}</Link>
            </Button>
          ))}
          {canSeeOthers ? (
            <Button asChild size='sm' variant={mineOnly ? 'tonal' : 'ghost'}>
              <Link href={href({ scope: mineOnly ? undefined : 'mine' })}>{mineOnly ? 'Showing only mine' : 'Only mine'}</Link>
            </Button>
          ) : null}
        </div>
        <Form action='/help-desk/tickets' className='flex gap-2'>
          <input type='hidden' name='status' value={status} />
          {mineOnly ? <input type='hidden' name='scope' value='mine' /> : null}
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input name='q' defaultValue={params.q || ''} placeholder='Search or SUP-2026-000001' aria-label='Search tickets' className='pl-10 sm:w-72' maxLength={100} />
          </div>
          <Button type='submit' variant='outline'>
            Search
          </Button>
        </Form>
      </div>

      <Card>
        <CardContent className='flex flex-col divide-y p-0'>
          {tickets.length ? (
            tickets.map((ticket: any) => (
              <Link key={ticket.id} href={`/help-desk/tickets/${ticket.id}`} className='hover:bg-muted/40 flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='min-w-0'>
                  <p className='truncate font-semibold'>{ticket.subject}</p>
                  <p className='text-textSecondary text-xs'>
                    {ticket.ticket_number} · {ticket.category?.label}
                    {ticket.module?.label ? ' · ' + ticket.module.label : ''}
                    {ticket.location?.name ? ' · ' + ticket.location.name : ''}
                    {ticket.requester_user_id !== access.user.id ? ' · ' + (ticket.requester_name || 'Colleague') : ''}
                  </p>
                </div>
                <div className='flex shrink-0 items-center gap-3'>
                  <StatusBadge status={ticket.status} audience='customer' />
                  <span className='text-textSecondary text-xs'>Updated {new Date(ticket.updated_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))
          ) : (
            <p className='text-textSecondary p-6 text-sm'>No tickets match these filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TicketsPage
