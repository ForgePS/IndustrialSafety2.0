import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { dispositionLabels, label, priorityLabels, slaLabels, sourceLabels, statusLabels } from '@/lib/forgeHelpdesk'
import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getConsoleTicketDetail } from '@/lib/forgeHelpdeskData'
import PrintButton from './PrintButton'

export const metadata: Metadata = { title: 'Print Ticket' }

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  [data-helpdesk-print], [data-helpdesk-print] * { visibility: visible !important; }
  [data-helpdesk-print] { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; }
  [data-print-hide] { display: none !important; }
}`

const PrintTicketPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ internal?: string }> }) => {
  await requireHelpdeskStaff()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const detail = await getConsoleTicketDetail(id)

  if (!detail) notFound()
  const includeInternal = query.internal !== '0'
  const { ticket } = detail
  const messages = detail.messages.filter((m: any) => includeInternal || m.visibility === 'public')

  return (
    <div data-helpdesk-print className='mx-auto flex max-w-3xl flex-col gap-4 text-sm'>
      <style>{PRINT_CSS}</style>
      <div data-print-hide className='flex flex-wrap items-center gap-3'>
        <PrintButton />
        <a className='text-primary underline' href={`?internal=${includeInternal ? '0' : '1'}`}>
          {includeInternal ? 'Customer-safe copy (hide internal notes)' : 'Include internal notes'}
        </a>
      </div>
      <header className='border-b pb-3'>
        <p className='text-textSecondary text-xs'>Forge Help Desk · printed {new Date().toLocaleString()}</p>
        <h1 className='text-xl font-bold'>
          {ticket.ticket_number} — {ticket.subject}
        </h1>
        <p>{includeInternal ? 'INTERNAL — contains Forge-only notes' : 'Customer-safe copy'}</p>
      </header>
      <dl className='grid grid-cols-[140px_minmax(0,1fr)] gap-y-1'>
        <dt className='font-semibold'>Tenant</dt>
        <dd>{(ticket as any).organization?.name}</dd>
        <dt className='font-semibold'>Requester</dt>
        <dd>
          {detail.requester.name}
          {detail.requester.email ? ` <${detail.requester.email}>` : ''}
        </dd>
        <dt className='font-semibold'>Status</dt>
        <dd>{label(statusLabels, ticket.status)}</dd>
        <dt className='font-semibold'>Priority</dt>
        <dd>
          {label(priorityLabels, ticket.priority)} (customer reported {label(priorityLabels, ticket.customer_reported_severity)})
        </dd>
        <dt className='font-semibold'>SLA</dt>
        <dd>{label(slaLabels, ticket.sla_state)}</dd>
        <dt className='font-semibold'>Request type</dt>
        <dd>
          {(ticket as any).category?.label}
          {(ticket as any).module?.label ? ' · ' + (ticket as any).module.label : ''}
        </dd>
        <dt className='font-semibold'>Disposition</dt>
        <dd>{ticket.disposition ? label(dispositionLabels, ticket.disposition) : '—'}</dd>
        <dt className='font-semibold'>Source</dt>
        <dd>{label(sourceLabels, ticket.source)}</dd>
        <dt className='font-semibold'>Assignee</dt>
        <dd>{detail.assigneeName || 'Unassigned'}</dd>
        <dt className='font-semibold'>Created</dt>
        <dd>{new Date(ticket.created_at).toLocaleString()}</dd>
        {ticket.resolved_at ? (
          <>
            <dt className='font-semibold'>Resolved</dt>
            <dd>{new Date(ticket.resolved_at).toLocaleString()}</dd>
          </>
        ) : null}
      </dl>
      <section>
        <h2 className='font-semibold'>Description</h2>
        <p className='whitespace-pre-wrap'>{ticket.description}</p>
      </section>
      {ticket.resolution_summary ? (
        <section>
          <h2 className='font-semibold'>Resolution</h2>
          <p className='whitespace-pre-wrap'>{ticket.resolution_summary}</p>
        </section>
      ) : null}
      <section className='flex flex-col gap-3'>
        <h2 className='font-semibold'>Conversation</h2>
        {messages.map((m: any) => (
          <article key={m.id} className='break-inside-avoid border-l-2 pl-3'>
            <p className='text-xs'>
              <strong>{m.author_name}</strong> · {m.visibility === 'internal' ? 'INTERNAL NOTE' : m.author_kind === 'customer' ? 'Customer' : 'Forge reply'} · {new Date(m.created_at).toLocaleString()}
            </p>
            <p className='whitespace-pre-wrap'>{m.body}</p>
          </article>
        ))}
      </section>
      {detail.attachments.length ? (
        <section>
          <h2 className='font-semibold'>Attachments</h2>
          <ul className='list-disc pl-5'>
            {detail.attachments
              .filter((a: any) => includeInternal || a.visibility === 'public')
              .map((a: any) => (
                <li key={a.id}>
                  {a.file_name} ({(a.byte_size / 1024).toFixed(0)} KB)
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export default PrintTicketPage
