'use client'

import { useMemo, useState } from 'react'

import Link from 'next/link'
import { TbArrowLeft, TbCopy, TbLock, TbMessage, TbPaperclip, TbPrinter, TbWorld } from 'react-icons/tb'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@repo/ui/components/ui/alert-dialog'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { cn } from '@repo/ui/lib/utils'

import { label, renderSavedReply, STAFF_STATUS_TRANSITIONS, statusLabels } from '@/lib/forgeHelpdesk'
import { PriorityBadge, SlaBadge, StatusBadge } from '@/components/helpdesk/HelpdeskBadges'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { decideSuggestionAction, sendConsoleMessageAction } from '../../actions'
import ContextPanel from './ContextPanel'
import AiPanel from './AiPanel'
import PropertiesPanel from './PropertiesPanel'

export type WorkspaceProps = {
  basePath: string
  detail: any
  reference: any
  catalog: any
  similar: any[]
  permissions: string[]
  currentUser: { id: string; name: string }
  developmentProviders: { key: string; label: string }[]
}

export type ComposerState = { mode: 'reply' | 'note'; body: string; savedReplyId: string | null; aiSuggestionId: string | null }

const EMPTY: ComposerState = { mode: 'reply', body: '', savedReplyId: null, aiSuggestionId: null }

const eventLine = (e: any) => {
  const value = (v: string | null) => (v ? label(statusLabels, v) : '—')

  switch (e.event_type) {
    case 'status_changed':
      return `${e.actor_name} changed status ${value(e.from_value)} → ${value(e.to_value)}`
    case 'priority_changed':
      return `${e.actor_name} changed priority ${e.from_value || '—'} → ${e.to_value || '—'}`
    case 'assigned':
    case 'reassigned':
    case 'unassigned':
      return `${e.actor_name}: ${e.event_type} ${e.detail || ''}`.trim()
    default:
      return `${e.actor_name}: ${e.event_type.replaceAll('_', ' ')}${e.detail ? ' — ' + e.detail : ''}`
  }
}

const TicketWorkspace = (props: WorkspaceProps) => {
  const { detail, reference, permissions, currentUser } = props
  const { ticket } = detail
  const can = (key: string) => permissions.includes(key)
  const { pending, notice, run, setNotice } = useActionRunner()
  const [composer, setComposer] = useState<ComposerState>({ ...EMPTY, mode: can('helpdesk.support.respond') ? 'reply' : 'note' })
  const [mentions, setMentions] = useState<string[]>([])
  const [setStatus, setSetStatus] = useState('')
  const [confirmReply, setConfirmReply] = useState(false)
  const [filter, setFilter] = useState<'all' | 'public' | 'internal'>('all')
  const closed = ticket.status === 'closed' || !!ticket.merged_into_ticket_id

  const timeline = useMemo(() => {
    const items = [
      ...detail.messages.map((m: any) => ({ kind: 'message', at: m.created_at, visibility: m.visibility, item: m })),
      ...detail.events
        .filter((e: any) => !['customer_reply', 'forge_reply', 'internal_note'].includes(e.event_type))
        .map((e: any) => ({ kind: 'event', at: e.created_at, visibility: e.visibility, item: e }))
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

    return filter === 'all' ? items : items.filter(i => i.visibility === filter)
  }, [detail.messages, detail.events, filter])

  const switchMode = (mode: 'reply' | 'note') => {
    if (mode === composer.mode) return
    if (mode === 'reply' && composer.body.trim()) setConfirmReply(true)
    else setComposer(c => ({ ...c, mode }))
  }

  const applySavedReply = (id: string) => {
    const reply = reference.savedReplies.find((r: any) => r.id === id)

    if (!reply) return

    const text = renderSavedReply(reply.body, {
      requester_name: detail.requester.name?.split(' ')[0] || 'there',
      ticket_number: ticket.ticket_number,
      tenant_name: ticket.organization?.name || '',
      product_name: ticket.product?.name || 'Forge Industrial Safety',
      support_agent_name: currentUser.name
    })

    setComposer(c => ({ ...c, body: c.body ? c.body.trimEnd() + '\n\n' + text : text, savedReplyId: id }))
  }

  const send = () =>
    run(
      async () => {
        const result = await sendConsoleMessageAction({
          ticketId: ticket.id,
          mode: composer.mode,
          body: composer.body,
          mentions: composer.mode === 'note' ? mentions : [],
          savedReplyId: composer.savedReplyId,
          aiSuggestionId: composer.aiSuggestionId,
          setStatus: composer.mode === 'reply' ? setStatus || null : null
        })

        if (result.ok && composer.aiSuggestionId) {
          const pendingSuggestion = detail.suggestions.find((s: any) => s.id === composer.aiSuggestionId && s.status === 'generated')

          if (pendingSuggestion) await decideSuggestionAction({ ticketId: ticket.id, suggestionId: composer.aiSuggestionId, decision: 'accepted', finalOutput: composer.body })
        }

        return result
      },
      composer.mode === 'note' ? 'Internal note added.' : 'Reply sent to the customer.',
      () => {
        setComposer(c => ({ ...EMPTY, mode: c.mode }))
        setMentions([])
        setSetStatus('')
      }
    )

  const replyStatuses = ['in_progress', 'waiting_on_customer', 'waiting_on_forge', 'resolved'].filter(s => s !== ticket.status && (STAFF_STATUS_TRANSITIONS[ticket.status] || []).includes(s))
  const canCompose = composer.mode === 'reply' ? can('helpdesk.support.respond') : can('helpdesk.support.internal_note')

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice({ tone: 'ok', text: 'Ticket link copied.' })
    } catch {
      setNotice({ tone: 'error', text: 'Copy failed. Copy the address bar instead.' })
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <Link href='/help-desk/console' className='text-primary flex items-center gap-1 text-sm'>
            <TbArrowLeft />
            Queue
          </Link>
          <h1 className='text-textPrimary mt-1 text-2xl font-bold'>
            <span className='text-textSecondary mr-2 font-mono text-lg'>{ticket.ticket_number}</span>
            {ticket.subject}
          </h1>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <SlaBadge state={ticket.sla_state} />
            {ticket.escalation_level > 0 ? <span className='text-destructive text-xs font-semibold'>Escalated L{ticket.escalation_level}</span> : null}
            <span className='text-textSecondary text-sm'>
              {ticket.organization?.name} · {ticket.category?.label}
              {ticket.module?.label ? ' · ' + ticket.module.label : ''}
            </span>
          </div>
        </div>
        <div className='flex gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={copyLink}>
            <TbCopy />
            Copy link
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link href={`/help-desk/console/tickets/${ticket.id}/print`} target='_blank'>
              <TbPrinter />
              Print / PDF
            </Link>
          </Button>
        </div>
      </div>

      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-sm', notice.tone === 'error' ? 'border-destructive/40 text-destructive' : 'border-success/40')}>
          {notice.text}
        </p>
      ) : null}

      {detail.mergedInto ? (
        <Card className='border-warning/50'>
          <CardContent className='p-3 text-sm'>
            Merged into{' '}
            <Link className='text-primary underline' href={`/help-desk/console/tickets/${detail.mergedInto.id}`}>
              {detail.mergedInto.ticket_number}
            </Link>
            . This ticket is read-only.
          </CardContent>
        </Card>
      ) : null}
      {detail.mergedFrom.length ? (
        <p className='text-textSecondary text-sm'>
          Merged duplicates:{' '}
          {detail.mergedFrom.map((m: any, i: number) => (
            <span key={m.id}>
              {i ? ', ' : ''}
              <Link className='text-primary underline' href={`/help-desk/console/tickets/${m.id}`}>
                {m.ticket_number}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      <div className='grid gap-4 lg:grid-cols-12'>
        <div className='order-2 flex flex-col gap-4 lg:order-1 lg:col-span-3'>
          <ContextPanel {...props} />
          {can('helpdesk.support.respond') ? (
            <AiPanel {...props} run={run} pending={pending} onUse={(text, suggestionId, mode) => setComposer({ mode, body: text, savedReplyId: null, aiSuggestionId: suggestionId })} />
          ) : null}
        </div>

        <div className='order-1 flex flex-col gap-4 lg:order-2 lg:col-span-6'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0'>
              <CardTitle className='text-lg'>Conversation</CardTitle>
              <div className='flex gap-1' role='group' aria-label='Filter conversation'>
                {(['all', 'public', 'internal'] as const).map(f => (
                  <Button key={f} type='button' size='xs' variant={filter === f ? 'tonal' : 'ghost'} onClick={() => setFilter(f)}>
                    {f === 'all' ? 'All' : f === 'public' ? 'Customer-visible' : 'Internal'}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              {filter !== 'internal' ? (
                <article className='rounded-lg border p-4'>
                  <header className='flex flex-wrap justify-between gap-2 text-sm'>
                    <span className='font-semibold'>{detail.requester.name} (customer)</span>
                    <time className='text-textSecondary'>{new Date(ticket.created_at).toLocaleString()}</time>
                  </header>
                  <p className='mt-2 whitespace-pre-wrap text-sm'>{ticket.description}</p>
                </article>
              ) : null}
              {timeline.map((entry: any) =>
                entry.kind === 'message' ? (
                  <article
                    key={'m' + entry.item.id}
                    className={cn(
                      'rounded-lg border p-4',
                      entry.item.visibility === 'internal' && 'border-warning/60 bg-warning/10',
                      entry.item.visibility === 'public' && entry.item.author_kind === 'forge' && 'border-primary/30 bg-primary/5'
                    )}
                  >
                    <header className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                      <span className='flex items-center gap-2 font-semibold'>
                        {entry.item.visibility === 'internal' ? <TbLock aria-hidden /> : <TbWorld aria-hidden />}
                        {entry.item.author_name}
                        <span className='text-textSecondary text-xs font-normal'>
                          {entry.item.visibility === 'internal' ? 'Internal note' : entry.item.author_kind === 'customer' ? 'Customer' : entry.item.author_kind === 'system' ? 'System' : 'Reply to customer'}
                        </span>
                      </span>
                      <time className='text-textSecondary'>{new Date(entry.item.created_at).toLocaleString()}</time>
                    </header>
                    <p className='mt-2 whitespace-pre-wrap text-sm'>{entry.item.body}</p>
                    {entry.item.mentions?.length ? <p className='text-textSecondary mt-2 text-xs'>Mentioned: {entry.item.mentions.join(', ')}</p> : null}
                    {entry.item.ai_suggestion_id ? <p className='text-textSecondary mt-1 text-xs'>Drafted with AI assistance, reviewed by staff.</p> : null}
                  </article>
                ) : (
                  <p key={'e' + entry.item.id} className='text-textSecondary flex items-center gap-2 pl-2 text-xs'>
                    {entry.item.visibility === 'internal' ? <TbLock aria-label='Internal' /> : <TbWorld aria-label='Customer-visible' />}
                    {eventLine(entry.item)} · {new Date(entry.item.created_at).toLocaleString()}
                  </p>
                )
              )}
            </CardContent>
          </Card>

          {!detail.mergedInto ? (
            <Card className={cn(composer.mode === 'note' ? 'border-warning/70' : 'border-primary/50')}>
              <CardContent className='flex flex-col gap-3 p-4'>
                <div className='flex flex-wrap items-center gap-2' role='tablist' aria-label='Message type'>
                  <Button type='button' role='tab' aria-selected={composer.mode === 'reply'} size='sm' variant={composer.mode === 'reply' ? 'default' : 'outline'} disabled={!can('helpdesk.support.respond')} onClick={() => switchMode('reply')}>
                    <TbMessage />
                    Reply to Customer
                  </Button>
                  <Button type='button' role='tab' aria-selected={composer.mode === 'note'} size='sm' variant={composer.mode === 'note' ? 'secondary' : 'outline'} disabled={!can('helpdesk.support.internal_note')} onClick={() => switchMode('note')}>
                    <TbLock />
                    Internal Note
                  </Button>
                  <select
                    aria-label='Insert saved reply'
                    value=''
                    onChange={e => applySavedReply(e.target.value)}
                    className='border-input bg-card ml-auto h-[32px] max-w-[220px] rounded-md border px-2 text-sm'
                  >
                    <option value=''>Saved replies…</option>
                    {reference.savedReplies.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.category} · {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className={cn('rounded-md px-3 py-2 text-xs font-medium', composer.mode === 'note' ? 'bg-warning/15' : 'bg-primary/10')}>
                  {composer.mode === 'note'
                    ? 'Internal note — visible to Forge staff only. Never shown to the customer.'
                    : `Reply — will be sent to ${detail.requester.name}${detail.requester.email ? ' <' + detail.requester.email + '>' : ''} and visible in their ticket.`}
                </p>
                {closed && composer.mode === 'reply' ? <p className='text-textSecondary text-sm'>Reopen this ticket before replying to the customer.</p> : null}
                <Textarea
                  aria-label={composer.mode === 'note' ? 'Internal note' : 'Reply to customer'}
                  rows={6}
                  maxLength={10000}
                  value={composer.body}
                  onChange={e => setComposer(c => ({ ...c, body: e.target.value }))}
                  placeholder={composer.mode === 'note' ? 'Notes for the Forge team. Use @mentions below to notify a teammate.' : 'Write your reply to the customer…'}
                />
                {composer.aiSuggestionId ? (
                  <p className='text-textSecondary text-xs'>
                    Using an AI draft. Review and edit before sending — it is never sent automatically.{' '}
                    <button type='button' className='text-primary underline' onClick={() => setComposer(c => ({ ...c, aiSuggestionId: null }))}>
                      Detach
                    </button>
                  </p>
                ) : null}
                <div className='flex flex-wrap items-center gap-2'>
                  {composer.mode === 'note' ? (
                    <select
                      aria-label='Mention a teammate'
                      value=''
                      onChange={e => {
                        const person = reference.staff.find((s: any) => s.user_id === e.target.value)

                        if (!person || mentions.includes(person.user_id)) return
                        setMentions(m => [...m, person.user_id])
                        setComposer(c => ({ ...c, body: (c.body ? c.body.trimEnd() + ' ' : '') + '@' + person.name + ' ' }))
                      }}
                      className='border-input bg-card h-[32px] rounded-md border px-2 text-sm'
                    >
                      <option value=''>@ Mention…</option>
                      {reference.staff
                        .filter((s: any) => s.user_id !== currentUser.id)
                        .map((s: any) => (
                          <option key={s.user_id} value={s.user_id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  ) : can('helpdesk.support.change_status') && replyStatuses.length ? (
                    <select aria-label='Set status with reply' value={setStatus} onChange={e => setSetStatus(e.target.value)} className='border-input bg-card h-[32px] rounded-md border px-2 text-sm'>
                      <option value=''>Keep status ({label(statusLabels, ticket.status)})</option>
                      {replyStatuses.map(s => (
                        <option key={s} value={s}>
                          Send and set {label(statusLabels, s)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {mentions.length ? (
                    <span className='text-textSecondary text-xs'>
                      Notifying {mentions.map(id => reference.staff.find((s: any) => s.user_id === id)?.name).join(', ')}{' '}
                      <button type='button' className='text-primary underline' onClick={() => setMentions([])}>
                        clear
                      </button>
                    </span>
                  ) : null}
                  <Button type='button' className='ml-auto' disabled={pending || !composer.body.trim() || !canCompose || (closed && composer.mode === 'reply')} onClick={send}>
                    {pending ? 'Saving…' : composer.mode === 'note' ? 'Add internal note' : setStatus === 'resolved' ? 'Send and resolve' : 'Send reply'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-lg'>
                <TbPaperclip />
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PropertiesPanel.Attachments {...props} run={run} pending={pending} />
            </CardContent>
          </Card>
        </div>

        <div className='order-3 flex flex-col gap-4 lg:col-span-3'>
          <PropertiesPanel {...props} run={run} pending={pending} />
        </div>
      </div>

      <AlertDialog open={confirmReply} onOpenChange={setConfirmReply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to a customer reply?</AlertDialogTitle>
            <AlertDialogDescription>
              You wrote this text as an internal note. If you switch to Reply to Customer, it will be sent to {detail.requester.name} when you press Send. Review it for internal details first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as internal note</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setComposer(c => ({ ...c, mode: 'reply' }))
                setMentions([])
              }}
            >
              Switch to reply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default TicketWorkspace
