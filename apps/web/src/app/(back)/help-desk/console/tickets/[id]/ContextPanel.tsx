'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { label, sourceLabels, statusLabels } from '@/lib/forgeHelpdesk'
import type { WorkspaceProps } from './TicketWorkspace'

const Row = ({ term, value }: { term: string; value: React.ReactNode }) =>
  value ? (
    <>
      <dt className='text-textSecondary'>{term}</dt>
      <dd className='break-words'>{value}</dd>
    </>
  ) : null

const ContextPanel = ({ detail, similar }: WorkspaceProps) => {
  const { ticket, technicalContext: tc, assist } = detail

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Requester</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid grid-cols-[90px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm'>
            <Row term='Name' value={detail.requester.name} />
            <Row term='Email' value={detail.requester.email ? <a className='text-primary underline' href={`mailto:${detail.requester.email}`}>{detail.requester.email}</a> : null} />
            <Row
              term='Tenant'
              value={
                <Link className='text-primary underline' href={`/help-desk/console?queue=all&tenant=${ticket.organization_id}`}>
                  {ticket.organization?.name}
                </Link>
              }
            />
            <Row term='Location' value={ticket.location?.name} />
            <Row term='Division' value={ticket.division?.name} />
            <Row term='Source' value={label(sourceLabels, ticket.source)} />
            <Row term='Created' value={new Date(ticket.created_at).toLocaleString()} />
            <Row term='Reopened' value={ticket.reopen_count ? `${ticket.reopen_count} time(s)` : null} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Technical context</CardTitle>
        </CardHeader>
        <CardContent>
          {tc ? (
            <dl className='grid grid-cols-[90px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm'>
              <Row term='Captured' value={tc.captured ? new Date(tc.captured_at).toLocaleString() : 'Not captured (legacy)'} />
              <Row term='Route' value={tc.route} />
              <Row term='Page' value={tc.page_url} />
              <Row term='Browser' value={[tc.browser_name, tc.browser_version].filter(Boolean).join(' ')} />
              <Row term='OS' value={tc.os_name} />
              <Row term='Device' value={tc.device_type ? `${tc.device_type}${tc.is_mobile ? ' (mobile)' : ''}` : null} />
              <Row term='Viewport' value={tc.viewport_width ? `${tc.viewport_width}×${tc.viewport_height}` : null} />
              <Row term='App' value={[tc.app_version, tc.build_version].filter(Boolean).join(' / ')} />
              <Row term='Timezone' value={tc.client_timezone} />
              <Row term='Role' value={tc.user_role} />
              <Row term='Error ID' value={tc.client_error_id ? <code>{tc.client_error_id}</code> : null} />
              <Row term='Correlation' value={tc.correlation_id ? <code>{tc.correlation_id}</code> : null} />
            </dl>
          ) : (
            <p className='text-textSecondary text-sm'>No technical context was captured.</p>
          )}
        </CardContent>
      </Card>

      {assist ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Ask Forge before submitting</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 text-sm'>
            <p>
              <span className='text-textSecondary'>Asked:</span> {assist.question}
            </p>
            {assist.answer ? <p className='text-textSecondary line-clamp-6 whitespace-pre-wrap'>{assist.answer}</p> : null}
            <p className='text-textSecondary text-xs'>
              {assist.answer_provider} · {assist.viewed_article_ids?.length || 0} article(s) viewed · marked not resolved
            </p>
          </CardContent>
        </Card>
      ) : null}

      {similar.length ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Possible duplicates</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 text-sm'>
            {similar.slice(0, 5).map((t: any) => (
              <Link key={t.id} href={`/help-desk/console/tickets/${t.id}`} className='hover:bg-muted/40 rounded p-1'>
                <span className='text-primary font-medium'>{t.ticket_number}</span> {t.subject}
                <span className='text-textSecondary block text-xs'>{label(statusLabels, t.status)}</span>
              </Link>
            ))}
            <p className='text-textSecondary text-xs'>Merge from the Links panel; nothing is lost when tickets are merged.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Recent tickets from {ticket.organization?.name}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-2 text-sm'>
          {detail.tenantTickets.length ? (
            detail.tenantTickets.map((t: any) => (
              <Link key={t.id} href={`/help-desk/console/tickets/${t.id}`} className='hover:bg-muted/40 rounded p-1'>
                <span className='text-primary font-medium'>{t.ticket_number}</span> {t.subject}
                <span className='text-textSecondary block text-xs'>
                  {label(statusLabels, t.status)} · {new Date(t.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))
          ) : (
            <p className='text-textSecondary'>No other tickets.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export default ContextPanel
