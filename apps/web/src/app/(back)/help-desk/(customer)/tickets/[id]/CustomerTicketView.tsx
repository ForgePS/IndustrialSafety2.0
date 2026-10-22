'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbAlertTriangle, TbArrowLeft, TbCircleCheck, TbPaperclip, TbStar, TbStarFilled } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { cn } from '@repo/ui/lib/utils'

import { customerStatusLabels, incidentStatusLabels, label, priorityLabels } from '@/lib/forgeHelpdesk'
import { StatusBadge } from '@/components/helpdesk/HelpdeskBadges'
import AttachmentUploader, { AttachmentPicker, uploadTicketAttachment } from '@/components/helpdesk/AttachmentUploader'
import { customerStatusAction, replyToTicketAction, submitCsatAction } from '@/app/(back)/help-desk/actions'

const eventText = (e: any) => {
  switch (e.event_type) {
    case 'created':
      return 'Ticket submitted'
    case 'status_changed':
      return `Status changed to ${label(customerStatusLabels, e.to_value)}`
    case 'reopened':
      return 'Ticket reopened'
    case 'attachment_added':
      return `File attached: ${e.detail || ''}`
    case 'merged':
      return `Merged ${e.detail ? 'into ' + e.detail : ''}`
    case 'incident_linked':
      return `Linked to platform incident ${e.to_value || ''}`
    default:
      return e.event_type.replaceAll('_', ' ')
  }
}

const CustomerTicketView = ({ basePath, detail, currentUserId, justCreated, uploadFailures }: { basePath: string; detail: any; currentUserId: string; justCreated: boolean; uploadFailures: number }) => {
  const router = useRouter()
  const { ticket, messages, events, attachments, csat, incidents, mergedInto, permissions } = detail
  const [reply, setReply] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [reopenReason, setReopenReason] = useState('')
  const [showReopen, setShowReopen] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      setMessage(null)
      const result = await fn()

      if (!result.ok) setMessage({ tone: 'error', text: result.error || 'Something went wrong.' })
      else {
        after?.()
        setMessage({ tone: 'ok', text: success })
        router.refresh()
      }
    })

  const sendReply = () =>
    start(async () => {
      setMessage(null)
      const result = await replyToTicketAction({ ticketId: ticket.id, body: reply })

      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error || 'Something went wrong.' })

        return
      }

      // The reply now exists, so always clear the form; otherwise a failed upload invites a duplicate send.
      const failed: string[] = []

      for (const file of replyFiles) {
        const upload = await uploadTicketAttachment(basePath, ticket.id, file, { messageId: String(result.message_id || '') || undefined })

        if (!upload.ok) failed.push(`${file.name} (${upload.error})`)
      }

      setReply('')
      setReplyFiles([])
      setMessage(
        failed.length
          ? { tone: 'error', text: `Reply sent, but these files did not upload: ${failed.join(', ')}. Add them again under Attachments.` }
          : { tone: 'ok', text: 'Reply sent.' }
      )
      router.refresh()
    })

  const timeline = [
    ...messages.map((m: any) => ({ kind: 'message' as const, at: m.created_at, item: m })),
    ...events.filter((e: any) => !['customer_reply', 'forge_reply'].includes(e.event_type)).map((e: any) => ({ kind: 'event' as const, at: e.created_at, item: e }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/help-desk/tickets' className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          My tickets
        </Link>
        <div className='mt-2 flex flex-wrap items-center gap-2'>
          <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>{ticket.subject}</h1>
          <StatusBadge status={ticket.status} audience='customer' />
        </div>
        <p className='text-textSecondary mt-1 text-sm'>
          {ticket.ticket_number} · {ticket.category?.label}
          {ticket.module?.label ? ' · ' + ticket.module.label : ''} · Submitted {new Date(ticket.created_at).toLocaleString()}
          {ticket.requester_user_id !== currentUserId ? ` by ${ticket.requester_name || 'a colleague'}` : ''}
        </p>
      </div>

      {justCreated ? (
        <Card className='border-primary/40'>
          <CardContent className='flex items-start gap-3 p-4'>
            <TbCircleCheck className='text-primary mt-0.5 shrink-0 text-xl' />
            <div className='text-sm'>
              <p className='font-semibold'>Ticket {ticket.ticket_number} submitted.</p>
              <p className='text-textSecondary'>Forge Support has been notified. You will get a notification when we reply.</p>
              {uploadFailures ? <p className='text-destructive mt-1'>{uploadFailures} attachment(s) could not be uploaded. Try adding them again below.</p> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {mergedInto ? (
        <Card>
          <CardContent className='p-4 text-sm'>
            This ticket was combined with{' '}
            <Link className='text-primary underline' href={`/help-desk/tickets/${mergedInto.id}`}>
              {mergedInto.ticket_number}
            </Link>{' '}
            so everything is handled in one place. Continue the conversation there.
          </CardContent>
        </Card>
      ) : null}

      {incidents.map((incident: any) => (
        <Card key={incident.id} className={incident.status === 'resolved' ? '' : 'border-destructive/40'}>
          <CardContent className='flex items-start gap-3 p-4 text-sm'>
            <TbAlertTriangle className={cn('mt-0.5 shrink-0 text-xl', incident.status === 'resolved' ? 'text-textSecondary' : 'text-destructive')} />
            <div>
              <div className='flex flex-wrap items-center gap-2 font-semibold'>
                Related service issue: {incident.title} <Badge size='sm' variant={incident.status === 'resolved' ? 'tonalSuccess' : 'destructive'}>{label(incidentStatusLabels, incident.status)}</Badge>
              </div>
              <p className='text-textSecondary'>{incident.public_message}</p>
              <Link href='/help-desk/status' className='text-primary underline'>
                View service status
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className='grid gap-6 lg:grid-cols-3'>
        <div className='flex flex-col gap-6 lg:col-span-2'>
          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <div className='rounded-lg border p-4'>
                <p className='text-sm font-semibold'>{ticket.requester_name || 'You'}</p>
                <p className='mt-2 whitespace-pre-wrap text-sm'>{ticket.description}</p>
              </div>
              {timeline.map(entry =>
                entry.kind === 'message' ? (
                  <div key={'m' + entry.item.id} className={cn('rounded-lg border p-4', entry.item.author_kind === 'forge' && 'bg-primary/5 border-primary/30', entry.item.author_kind === 'system' && 'bg-muted/50')}>
                    <div className='flex flex-wrap justify-between gap-2 text-sm'>
                      <span className='font-semibold'>{entry.item.author_name}</span>
                      <time className='text-textSecondary'>{new Date(entry.item.created_at).toLocaleString()}</time>
                    </div>
                    <p className='mt-2 whitespace-pre-wrap text-sm'>{entry.item.body}</p>
                  </div>
                ) : (
                  <p key={'e' + entry.item.id} className='text-textSecondary pl-4 text-xs'>
                    {eventText(entry.item)} · {new Date(entry.item.created_at).toLocaleString()}
                  </p>
                )
              )}

              {permissions.canReply ? (
                <div className='flex flex-col gap-3 border-t pt-4'>
                  <label htmlFor='customer-reply' className='text-sm font-medium'>
                    Reply to Forge Support
                  </label>
                  <Textarea id='customer-reply' rows={4} maxLength={10000} value={reply} onChange={e => setReply(e.target.value)} placeholder='Add details, answer a question, or let us know it is fixed.' />
                  <AttachmentPicker files={replyFiles} onChange={setReplyFiles} disabled={pending} />
                  <div>
                    <Button type='button' disabled={pending || !reply.trim()} onClick={sendReply}>
                      {pending ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {message ? (
                <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
                  {message.text}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {ticket.resolution_summary && ['resolved', 'closed'].includes(ticket.status) ? (
            <Card>
              <CardHeader>
                <CardTitle>Resolution</CardTitle>
              </CardHeader>
              <CardContent className='text-sm'>
                <p className='whitespace-pre-wrap'>{ticket.resolution_summary}</p>
                {ticket.fix_version ? <p className='text-textSecondary mt-2'>Fixed in Forge {ticket.fix_version}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {permissions.canRate ? (
            <Card>
              <CardHeader>
                <CardTitle>How did we do?</CardTitle>
                <CardDescription>Rate your support experience. Your rating goes to Forge leadership and cannot be edited by agents.</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                <div className='flex gap-1' role='radiogroup' aria-label='Rating from 1 to 5'>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type='button' role='radio' aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className='text-primary p-1 text-3xl'>
                      {n <= rating ? <TbStarFilled /> : <TbStar />}
                    </button>
                  ))}
                </div>
                <Textarea rows={3} maxLength={2000} value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder='Anything else we should know? (optional)' aria-label='Rating comment' />
                <div>
                  <Button type='button' disabled={pending || !rating} onClick={() => run(() => submitCsatAction({ ticketId: ticket.id, rating, comment: ratingComment }), 'Thanks for rating your experience.')}>
                    Submit rating
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : csat ? (
            <Card>
              <CardContent className='flex items-center gap-2 p-4 text-sm'>
                <span>Your rating:</span>
                <span className='text-primary flex'>{[1, 2, 3, 4, 5].map(n => (n <= csat.rating ? <TbStarFilled key={n} /> : <TbStar key={n} />))}</span>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className='grid grid-cols-[110px_1fr] gap-y-2 text-sm'>
                <dt className='text-textSecondary'>Status</dt>
                <dd>{label(customerStatusLabels, ticket.status)}</dd>
                <dt className='text-textSecondary'>Your impact</dt>
                <dd>{label(priorityLabels, ticket.customer_reported_severity)}</dd>
                <dt className='text-textSecondary'>Location</dt>
                <dd>{ticket.location?.name || '—'}</dd>
                <dt className='text-textSecondary'>First reply</dt>
                <dd>{ticket.first_responded_at ? new Date(ticket.first_responded_at).toLocaleString() : 'Pending'}</dd>
              </dl>
              <div className='mt-4 flex flex-col gap-2'>
                {permissions.canReopen ? (
                  showReopen ? (
                    <div className='flex flex-col gap-2'>
                      <Textarea rows={3} maxLength={2000} value={reopenReason} onChange={e => setReopenReason(e.target.value)} placeholder='What is still not working?' aria-label='Reason for reopening' />
                      <Button
                        type='button'
                        size='sm'
                        disabled={pending || reopenReason.trim().length < 3}
                        onClick={() => run(() => customerStatusAction({ ticketId: ticket.id, action: 'reopen', expectedRowVersion: ticket.row_version, reason: reopenReason }), 'Ticket reopened.', () => setShowReopen(false))}
                      >
                        Reopen ticket
                      </Button>
                    </div>
                  ) : (
                    <Button type='button' size='sm' variant='outline' onClick={() => setShowReopen(true)}>
                      Not fixed? Reopen
                    </Button>
                  )
                ) : null}
                {permissions.canClose ? (
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm('Close this ticket? Forge Support will stop working on it.')) run(() => customerStatusAction({ ticketId: ticket.id, action: 'close', expectedRowVersion: ticket.row_version }), 'Ticket closed.')
                    }}
                  >
                    Close ticket
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              {attachments.length ? (
                attachments.map((a: any) => (
                  <a key={a.id} href={`${basePath}/api/helpdesk/attachments/${a.id}`} className='text-primary flex items-center gap-2 break-all text-sm underline'>
                    <TbPaperclip className='shrink-0' />
                    {a.file_name} · {(a.byte_size / 1024).toFixed(0)} KB
                  </a>
                ))
              ) : (
                <p className='text-textSecondary text-sm'>No attachments.</p>
              )}
              {permissions.canAttach ? <AttachmentUploader basePath={basePath} ticketId={ticket.id} /> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CustomerTicketView
