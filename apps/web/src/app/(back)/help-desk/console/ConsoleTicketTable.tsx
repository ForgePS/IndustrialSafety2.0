'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { dueIn } from '@/lib/forgeHelpdesk'
import { PriorityBadge, SlaBadge, StatusBadge } from '@/components/helpdesk/HelpdeskBadges'
import { bulkAssignAction } from './actions'

type Ticket = {
  id: string
  ticket_number: string
  subject: string
  status: string
  priority: string
  sla_state: string
  first_response_due_at: string | null
  next_response_due_at: string | null
  resolution_due_at: string | null
  requester_name: string | null
  assignee_name: string | null
  updated_at: string
  organization?: { name: string } | null
  category?: { label: string } | null
  module?: { label: string } | null
}

const nextDue = (t: Ticket) => (['resolved', 'closed'].includes(t.status) ? null : t.next_response_due_at || t.first_response_due_at || t.resolution_due_at)

const ConsoleTicketTable = ({ tickets, staff, canAssign }: { tickets: Ticket[]; staff: { user_id: string; name: string }[]; canAssign: boolean }) => {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [assignee, setAssignee] = useState('')
  const [message, setMessage] = useState('')
  const [pending, start] = useTransition()
  const allSelected = tickets.length > 0 && selected.length === tickets.length

  const toggle = (id: string) => setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const assign = () =>
    start(async () => {
      const result = await bulkAssignAction({ ticketIds: selected, assignedUserId: assignee === 'none' ? null : assignee })
      const updated = Number(result.updated || 0)

      setMessage(result.ok ? `Updated ${updated} ticket(s).` : `${updated ? `Updated ${updated} ticket(s). ` : ''}${result.error || 'Bulk assignment failed.'}`)

      if (updated) {
        setSelected([])
        router.refresh()
      }
    })

  return (
    <Card>
      <CardContent className='flex flex-col gap-3 p-0'>
        {canAssign && selected.length ? (
          <div className='bg-primary/5 flex flex-wrap items-center gap-2 border-b p-3'>
            <span className='text-sm font-medium'>{selected.length} selected</span>
            <select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label='Assign selected to' className='border-input bg-card h-[34px] rounded-md border px-2 text-sm'>
              <option value=''>Assign to…</option>
              <option value='none'>Unassign</option>
              {staff.map(s => (
                <option key={s.user_id} value={s.user_id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button type='button' size='sm' disabled={!assignee || pending} onClick={assign}>
              Apply
            </Button>
            <Button type='button' size='sm' variant='ghost' onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}
        {message ? (
          <p role='status' className='px-4 pt-2 text-sm'>
            {message}
          </p>
        ) : null}

        <div className='hidden md:block'>
          <Table>
            <TableHeader>
              <TableRow>
                {canAssign ? (
                  <TableHead className='w-10'>
                    <input type='checkbox' aria-label='Select all tickets' checked={allSelected} onChange={() => setSelected(allSelected ? [] : tickets.map(t => t.id))} />
                  </TableHead>
                ) : null}
                <TableHead>Ticket</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map(t => {
                const due = nextDue(t)

                return (
                  <TableRow key={t.id} data-state={selected.includes(t.id) ? 'selected' : undefined}>
                    {canAssign ? (
                      <TableCell>
                        <input type='checkbox' aria-label={`Select ${t.ticket_number}`} checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                      </TableCell>
                    ) : null}
                    <TableCell className='max-w-[360px]'>
                      <Link href={`/help-desk/console/tickets/${t.id}`} className='text-primary font-medium hover:underline'>
                        {t.ticket_number}
                      </Link>
                      <p className='truncate text-sm'>{t.subject}</p>
                      <p className='text-textSecondary truncate text-xs'>
                        {t.category?.label}
                        {t.module?.label ? ' · ' + t.module.label : ''}
                        {t.requester_name ? ' · ' + t.requester_name : ''}
                      </p>
                    </TableCell>
                    <TableCell className='text-sm'>{t.organization?.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={t.priority} />
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-col gap-1'>
                        <SlaBadge state={t.sla_state} />
                        {/* Relative to "now": server and browser can straddle a minute boundary. */}
                        {due && t.sla_state !== 'paused' ? (
                          <span className='text-textSecondary text-xs' suppressHydrationWarning>
                            {dueIn(due)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className='text-sm'>{t.assignee_name || <span className='text-textSecondary'>Unassigned</span>}</TableCell>
                    <TableCell className='text-textSecondary text-xs'>{new Date(t.updated_at).toLocaleString()}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className='flex flex-col divide-y md:hidden'>
          {tickets.map(t => (
            <div key={t.id} className='flex gap-3 p-4'>
              {canAssign ? <input type='checkbox' aria-label={`Select ${t.ticket_number}`} checked={selected.includes(t.id)} onChange={() => toggle(t.id)} className='mt-1' /> : null}
              <Link href={`/help-desk/console/tickets/${t.id}`} className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='text-primary text-sm font-medium'>
                  {t.ticket_number} · {t.organization?.name}
                </span>
                <span className='truncate font-medium'>{t.subject}</span>
                <div className='flex flex-wrap gap-1'>
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                  <SlaBadge state={t.sla_state} />
                </div>
                <span className='text-textSecondary text-xs'>{t.assignee_name || 'Unassigned'}</span>
              </Link>
            </div>
          ))}
        </div>

        {!tickets.length ? <p className='text-textSecondary p-6 text-sm'>No tickets in this queue.</p> : null}
      </CardContent>
    </Card>
  )
}

export default ConsoleTicketTable
