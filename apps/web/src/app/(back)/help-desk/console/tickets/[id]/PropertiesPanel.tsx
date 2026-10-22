'use client'

import { useState, type ReactNode } from 'react'

import Link from 'next/link'
import { TbDownload, TbEye, TbLock, TbX } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'

import {
  developmentStateLabels,
  developmentTypeLabels,
  dispositionLabels,
  dueIn,
  HELPDESK_DISPOSITIONS,
  HELPDESK_PRIORITIES,
  incidentStatusLabels,
  label,
  priorityLabels,
  slaLabels,
  STAFF_STATUS_TRANSITIONS,
  statusLabels
} from '@/lib/forgeHelpdesk'
import AttachmentUploader from '@/components/helpdesk/AttachmentUploader'
import type { ActionResult } from '@/components/helpdesk/useActionRunner'
import {
  applyTicketChangeAction,
  createDevelopmentIssueAction,
  linkDevelopmentIssueAction,
  linkIncidentTicketAction,
  linkTicketsAction,
  mergeTicketsAction,
  removeAttachmentAction,
  sendConsoleMessageAction,
  setTicketTagsAction,
  setWatcherAction,
  unlinkTicketsAction
} from '../../actions'
import type { WorkspaceProps } from './TicketWorkspace'

type Props = WorkspaceProps & {
  run: (fn: () => Promise<ActionResult>, success?: string, after?: (r: ActionResult) => void) => void
  pending: boolean
}

const selectClass = 'border-input bg-card h-[34px] w-full rounded-md border px-2 text-sm'

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card>
    <CardHeader className='pb-3'>
      <CardTitle className='text-base'>{title}</CardTitle>
    </CardHeader>
    <CardContent className='flex flex-col gap-3 text-sm'>{children}</CardContent>
  </Card>
)

const Field = ({ id, text, children }: { id: string; text: string; children: ReactNode }) => (
  <div className='flex flex-col gap-1'>
    <label htmlFor={id} className='text-textSecondary text-xs font-medium'>
      {text}
    </label>
    {children}
  </div>
)

const PropertiesPanel = (props: Props) => {
  const { detail, reference, catalog, permissions, currentUser, developmentProviders, run, pending } = props
  const { ticket } = detail
  const can = (key: string) => permissions.includes(key)
  const merged = !!ticket.merged_into_ticket_id

  const change = (changes: Record<string, string | boolean | null>, success: string, reason?: string) =>
    run(() => applyTicketChangeAction({ ticketId: ticket.id, expectedRowVersion: ticket.row_version, changes, reason: reason || null }), success)

  // Workflow
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState(ticket.resolution_summary || '')
  const [fixVersion, setFixVersion] = useState(ticket.fix_version || '')
  const [infoRequest, setInfoRequest] = useState('')
  const nextStatuses = STAFF_STATUS_TRANSITIONS[ticket.status] || []
  const needsSummary = ['resolved', 'closed'].includes(status)

  // Links, merge, incidents, development
  const [linkTarget, setLinkTarget] = useState('')
  const [linkType, setLinkType] = useState<'related' | 'parent_of' | 'child_of'>('related')
  const [mergeTarget, setMergeTarget] = useState('')
  const [mergeReason, setMergeReason] = useState('')
  const [incidentId, setIncidentId] = useState('')
  const [devIssueId, setDevIssueId] = useState('')
  const [devForm, setDevForm] = useState<null | { title: string; issueType: string; priority: string; description: string; customerImpact: string; push: string }>(null)

  const watching = detail.watchers.some((w: any) => w.user_id === currentUser.id)
  const tagIds = detail.tags.map((t: any) => t.id)
  const sla = detail.sla

  return (
    <>
      {!merged ? (
        <Section title='Workflow'>
          {can('helpdesk.support.change_status') ? (
            <>
              <Field id='ws-status' text={`Status (now ${label(statusLabels, ticket.status)})`}>
                <select id='ws-status' value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
                  <option value=''>Change status…</option>
                  {nextStatuses.map(s => (
                    <option key={s} value={s}>
                      {label(statusLabels, s)}
                    </option>
                  ))}
                </select>
              </Field>
              {needsSummary ? (
                <>
                  <Field id='ws-summary' text='Resolution summary (shared with the customer)'>
                    <Textarea id='ws-summary' rows={3} maxLength={4000} value={summary} onChange={e => setSummary(e.target.value)} />
                  </Field>
                  {can('helpdesk.support.link_development') ? (
                    <Field id='ws-fix' text='Fixed in version (optional)'>
                      <Input id='ws-fix' maxLength={80} value={fixVersion} onChange={e => setFixVersion(e.target.value)} placeholder='e.g. 2.4.1' />
                    </Field>
                  ) : null}
                </>
              ) : null}
              {status ? (
                <>
                  <Field id='ws-reason' text={status === 'reopened' ? 'Reason for reopening' : 'Reason (optional, internal)'}>
                    <Input id='ws-reason' maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
                  </Field>
                  <Button
                    type='button'
                    size='sm'
                    disabled={pending || (needsSummary && summary.trim().length < 3) || (status === 'reopened' && reason.trim().length < 3)}
                    onClick={() => {
                      const changes: Record<string, string> = { status }

                      if (needsSummary) changes.resolution_summary = summary
                      if (needsSummary && fixVersion.trim() && can('helpdesk.support.link_development')) changes.fix_version = fixVersion
                      change(changes, `Status set to ${label(statusLabels, status)}.`, reason)
                      setStatus('')
                      setReason('')
                    }}
                  >
                    Apply status
                  </Button>
                </>
              ) : null}
            </>
          ) : null}

          {can('helpdesk.support.respond') && !['resolved', 'closed'].includes(ticket.status) ? (
            <details className='rounded-md border p-2'>
              <summary className='cursor-pointer text-sm font-medium'>Request more information</summary>
              <div className='mt-2 flex flex-col gap-2'>
                <Textarea rows={3} aria-label='Information to request' maxLength={4000} value={infoRequest} onChange={e => setInfoRequest(e.target.value)} placeholder='What do you need from the customer?' />
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={pending || infoRequest.trim().length < 3}
                  onClick={() =>
                    run(
                      () => sendConsoleMessageAction({ ticketId: ticket.id, mode: 'reply', body: infoRequest, setStatus: ticket.status === 'waiting_on_customer' ? null : 'waiting_on_customer' }),
                      'Request sent. Ticket is waiting on the customer and the SLA is paused.',
                      () => setInfoRequest('')
                    )
                  }
                >
                  Send and wait on customer
                </Button>
              </div>
            </details>
          ) : null}

          {can('helpdesk.support.escalate') && !['resolved', 'closed'].includes(ticket.status) ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={pending}
              onClick={() => {
                const why = window.prompt('Why does this ticket need escalation?')

                if (why && why.trim().length >= 3) change({ escalate: true }, `Escalated to level ${ticket.escalation_level + 1}.`, why)
              }}
            >
              Escalate (now L{ticket.escalation_level})
            </Button>
          ) : null}
        </Section>
      ) : null}

      {!merged ? (
        <Section title='Priority & assignment'>
          <p className='text-textSecondary text-xs'>Customer reported: {label(priorityLabels, ticket.customer_reported_severity)}</p>
          <Field id='ws-priority' text='Forge priority'>
            <select
              id='ws-priority'
              value={ticket.priority}
              disabled={!can('helpdesk.support.change_priority') || pending}
              onChange={e => {
                const why = window.prompt(`Reason for changing priority to ${label(priorityLabels, e.target.value)}?`)

                if (why !== null) change({ priority: e.target.value }, 'Priority updated.', why)
              }}
              className={selectClass}
            >
              {HELPDESK_PRIORITIES.map(p => (
                <option key={p} value={p}>
                  {label(priorityLabels, p)}
                </option>
              ))}
            </select>
          </Field>
          <Field id='ws-team' text='Team'>
            <select id='ws-team' value={ticket.assigned_team_id || ''} disabled={!can('helpdesk.support.assign') || pending} onChange={e => change({ assigned_team_id: e.target.value || null }, 'Team updated.')} className={selectClass}>
              <option value=''>No team</option>
              {reference.teams.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id='ws-assignee' text='Assignee'>
            <select id='ws-assignee' value={ticket.assigned_user_id || ''} disabled={!can('helpdesk.support.assign') || pending} onChange={e => change({ assigned_user_id: e.target.value || null }, e.target.value ? 'Ticket assigned.' : 'Ticket unassigned.')} className={selectClass}>
              <option value=''>Unassigned</option>
              {reference.staff
                .filter((s: any) => !ticket.assigned_team_id || s.team_ids.includes(ticket.assigned_team_id))
                .map((s: any) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          {can('helpdesk.support.assign') && ticket.assigned_user_id !== currentUser.id ? (
            <Button type='button' size='sm' variant='outline' disabled={pending} onClick={() => change({ assigned_user_id: currentUser.id }, 'Assigned to you.')}>
              Assign to me
            </Button>
          ) : null}
        </Section>
      ) : null}

      {!merged ? (
        <Section title='Classification'>
          <Field id='ws-category' text='Request type'>
            <select id='ws-category' value={ticket.category_id} disabled={!can('helpdesk.support.change_status') || pending} onChange={e => change({ category_id: e.target.value }, 'Request type updated.')} className={selectClass}>
              {catalog.categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id='ws-module' text='Product area'>
            <select id='ws-module' value={ticket.module_id || ''} disabled={!can('helpdesk.support.change_status') || pending} onChange={e => change({ module_id: e.target.value || null }, 'Product area updated.')} className={selectClass}>
              <option value=''>Not specified</option>
              {catalog.areas
                .filter((a: any) => a.product_id === ticket.product_id)
                .map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field id='ws-disposition' text='Disposition'>
            <select id='ws-disposition' value={ticket.disposition || ''} disabled={!can('helpdesk.support.change_status') || pending} onChange={e => change({ disposition: e.target.value || null }, 'Disposition updated.')} className={selectClass}>
              <option value=''>None</option>
              {HELPDESK_DISPOSITIONS.filter(d => d !== 'duplicate' || ticket.disposition === 'duplicate').map(d => (
                <option key={d} value={d} disabled={d === 'duplicate'}>
                  {label(dispositionLabels, d)}
                </option>
              ))}
            </select>
          </Field>
          {can('helpdesk.support.change_status') ? (
            <div className='flex flex-wrap gap-1'>
              {(['known_issue', 'feature_request', 'bug_confirmed'] as const)
                .filter(d => d !== ticket.disposition)
                .map(d => (
                  <Button key={d} type='button' size='xs' variant='outline' disabled={pending} onClick={() => change({ disposition: d }, `Marked as ${label(dispositionLabels, d).toLowerCase()}.`)}>
                    Mark {label(dispositionLabels, d).toLowerCase()}
                  </Button>
                ))}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title='Tags & watchers'>
        <div className='flex flex-wrap gap-1'>
          {detail.tags.map((t: any) => (
            <Badge key={t.id} size='sm' variant='outline' style={t.color ? { borderColor: t.color } : undefined}>
              {t.label}
              {can('helpdesk.support.change_status') && !merged ? (
                <button type='button' aria-label={`Remove tag ${t.label}`} disabled={pending} onClick={() => run(() => setTicketTagsAction({ ticketId: ticket.id, remove: [t.id] }), 'Tag removed.')}>
                  <TbX />
                </button>
              ) : null}
            </Badge>
          ))}
          {!detail.tags.length ? <span className='text-textSecondary text-xs'>No tags</span> : null}
        </div>
        {can('helpdesk.support.change_status') && !merged ? (
          <select aria-label='Add tag' value='' onChange={e => e.target.value && run(() => setTicketTagsAction({ ticketId: ticket.id, add: [e.target.value] }), 'Tag added.')} className={selectClass}>
            <option value=''>Add tag…</option>
            {reference.tags
              .filter((t: any) => !tagIds.includes(t.id) && (!t.organization_id || t.organization_id === ticket.organization_id))
              .map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>
        ) : null}
        <div className='border-t pt-3'>
          <p className='text-textSecondary mb-1 text-xs font-medium'>Watchers</p>
          <ul className='flex flex-col gap-1'>
            {detail.watchers.map((w: any) => (
              <li key={w.user_id} className='flex items-center justify-between gap-2'>
                <span>
                  {w.name} <span className='text-textSecondary text-xs'>({w.watcher_type})</span>
                </span>
                {(can('helpdesk.support.manage_watchers') || w.user_id === currentUser.id) && w.user_id !== ticket.requester_user_id ? (
                  <button type='button' aria-label={`Remove watcher ${w.name}`} disabled={pending} onClick={() => run(() => setWatcherAction({ ticketId: ticket.id, userId: w.user_id, watch: false }), 'Watcher removed.')}>
                    <TbX />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className='mt-2 flex flex-col gap-2'>
            <Button type='button' size='xs' variant='outline' disabled={pending} onClick={() => run(() => setWatcherAction({ ticketId: ticket.id, userId: currentUser.id, watch: !watching }), watching ? 'You stopped watching.' : 'You are watching this ticket.')}>
              <TbEye />
              {watching ? 'Unwatch' : 'Watch'}
            </Button>
            {can('helpdesk.support.manage_watchers') ? (
              <select aria-label='Add watcher' value='' onChange={e => e.target.value && run(() => setWatcherAction({ ticketId: ticket.id, userId: e.target.value, watch: true }), 'Watcher added.')} className={selectClass}>
                <option value=''>Add Forge watcher…</option>
                {reference.staff
                  .filter((s: any) => !detail.watchers.some((w: any) => w.user_id === s.user_id))
                  .map((s: any) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title='Links & merge'>
        {detail.relations.length ? (
          <ul className='flex flex-col gap-1'>
            {detail.relations.map((r: any) => (
              <li key={r.id} className='flex items-center justify-between gap-2'>
                <span>
                  <span className='text-textSecondary text-xs'>{r.direction} </span>
                  {r.other ? (
                    <Link className='text-primary underline' href={`/help-desk/console/tickets/${r.other.id}`}>
                      {r.other.ticket_number}
                    </Link>
                  ) : (
                    'ticket'
                  )}
                </span>
                {r.relation_type !== 'duplicate_of' && can('helpdesk.support.change_status') ? (
                  <button type='button' aria-label='Remove link' disabled={pending} onClick={() => run(() => unlinkTicketsAction({ ticketId: ticket.id, relationId: r.id }), 'Link removed.')}>
                    <TbX />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-textSecondary text-xs'>No linked tickets.</p>
        )}
        {can('helpdesk.support.change_status') && !merged ? (
          <div className='flex flex-col gap-2'>
            <div className='flex gap-2'>
              <select aria-label='Link type' value={linkType} onChange={e => setLinkType(e.target.value as typeof linkType)} className='border-input bg-card h-[34px] rounded-md border px-2 text-sm'>
                <option value='related'>Related</option>
                <option value='parent_of'>Parent of</option>
                <option value='child_of'>Child of</option>
              </select>
              <Input aria-label='Ticket number to link' value={linkTarget} onChange={e => setLinkTarget(e.target.value)} placeholder='SUP-2026-000123' className='h-[34px]' />
            </div>
            <Button type='button' size='xs' variant='outline' disabled={pending || !linkTarget.trim()} onClick={() => run(() => linkTicketsAction({ ticketId: ticket.id, target: linkTarget, relation: linkType }), 'Tickets linked.', () => setLinkTarget(''))}>
              Link ticket
            </Button>
          </div>
        ) : null}
        {can('helpdesk.support.merge') && !merged ? (
          <details className='rounded-md border p-2'>
            <summary className='cursor-pointer text-sm font-medium'>Merge as duplicate</summary>
            <div className='mt-2 flex flex-col gap-2'>
              <p className='text-textSecondary text-xs'>This ticket closes and its messages, files and watchers stay available on the primary ticket. The customer is told where to continue.</p>
              <Input aria-label='Primary ticket number' value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} placeholder='Primary ticket, e.g. SUP-2026-000001' />
              <Input aria-label='Merge reason' value={mergeReason} onChange={e => setMergeReason(e.target.value)} placeholder='Why are these duplicates?' maxLength={2000} />
              <Button
                type='button'
                size='xs'
                variant='destructive'
                disabled={pending || !mergeTarget.trim() || mergeReason.trim().length < 3}
                onClick={() => {
                  if (window.confirm(`Merge ${ticket.ticket_number} into ${mergeTarget.trim().toUpperCase()}? This cannot be undone.`))
                    run(() => mergeTicketsAction({ duplicateTicketId: ticket.id, canonical: mergeTarget, reason: mergeReason }), 'Tickets merged.')
                }}
              >
                Merge into primary
              </Button>
            </div>
          </details>
        ) : null}
      </Section>

      <Section title='Platform incidents'>
        {detail.incidents.length ? (
          detail.incidents.map((l: any) => (
            <div key={l.id} className='flex items-center justify-between gap-2'>
              <Link className='text-primary underline' href={`/help-desk/console/incidents/${l.incident.id}`}>
                {l.incident.incident_number} {l.incident.title}
              </Link>
              <span className='flex items-center gap-1'>
                <Badge size='sm' variant={l.incident.status === 'resolved' ? 'tonalSuccess' : 'destructive'}>
                  {label(incidentStatusLabels, l.incident.status)}
                </Badge>
                {can('helpdesk.support.link_incident') ? (
                  <button type='button' aria-label='Unlink incident' disabled={pending} onClick={() => run(() => linkIncidentTicketAction({ incidentId: l.incident.id, ticket: ticket.id, link: false }), 'Incident unlinked.')}>
                    <TbX />
                  </button>
                ) : null}
              </span>
            </div>
          ))
        ) : (
          <p className='text-textSecondary text-xs'>Not linked to an incident.</p>
        )}
        {can('helpdesk.support.link_incident') && !merged ? (
          <div className='flex gap-2'>
            <select aria-label='Active incident' value={incidentId} onChange={e => setIncidentId(e.target.value)} className={selectClass}>
              <option value=''>Link active incident…</option>
              {reference.activeIncidents
                .filter((i: any) => !detail.incidents.some((l: any) => l.incident.id === i.id))
                .map((i: any) => (
                  <option key={i.id} value={i.id}>
                    {i.incident_number} {i.title}
                  </option>
                ))}
            </select>
            <Button type='button' size='sm' variant='outline' disabled={pending || !incidentId} onClick={() => run(() => linkIncidentTicketAction({ incidentId, ticket: ticket.id, link: true }), 'Linked to incident. The customer can see the public incident status.', () => setIncidentId(''))}>
              Link
            </Button>
          </div>
        ) : null}
        {can('helpdesk.admin.incidents') ? (
          <Link className='text-primary text-xs underline' href={`/help-desk/console/incidents?declare=1&ticket=${ticket.id}`}>
            Declare a new platform incident from this ticket
          </Link>
        ) : null}
      </Section>

      {can('helpdesk.support.link_development') ? (
        <Section title='Development'>
          {detail.developmentLinks.length ? (
            detail.developmentLinks.map((l: any) => (
              <div key={l.id} className='flex items-start justify-between gap-2'>
                <div>
                  <Link className='text-primary underline' href={`/help-desk/console/development/${l.issue.id}`}>
                    {l.issue.issue_number}
                  </Link>{' '}
                  {l.issue.title}
                  <p className='text-textSecondary text-xs'>
                    {label(developmentTypeLabels, l.issue.issue_type)} · {label(developmentStateLabels, l.issue.state)}
                    {l.issue.fix_version ? ' · fix ' + l.issue.fix_version : ''}
                    {l.issue.external_url ? (
                      <>
                        {' · '}
                        <a className='underline' href={l.issue.external_url} target='_blank' rel='noreferrer'>
                          {l.issue.external_provider}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <button type='button' aria-label='Unlink development issue' disabled={pending} onClick={() => run(() => linkDevelopmentIssueAction({ issueId: l.issue.id, ticketId: ticket.id, link: false }), 'Development issue unlinked.')}>
                  <TbX />
                </button>
              </div>
            ))
          ) : (
            <p className='text-textSecondary text-xs'>No development issue linked.</p>
          )}
          {!merged ? (
            <>
              <div className='flex gap-2'>
                <select aria-label='Open development issue' value={devIssueId} onChange={e => setDevIssueId(e.target.value)} className={selectClass}>
                  <option value=''>Link existing issue…</option>
                  {reference.openDevelopmentIssues
                    .filter((i: any) => !detail.developmentLinks.some((l: any) => l.issue.id === i.id))
                    .map((i: any) => (
                      <option key={i.id} value={i.id}>
                        {i.issue_number} {i.title}
                      </option>
                    ))}
                </select>
                <Button type='button' size='sm' variant='outline' disabled={pending || !devIssueId} onClick={() => run(() => linkDevelopmentIssueAction({ issueId: devIssueId, ticketId: ticket.id, link: true }), 'Development issue linked.', () => setDevIssueId(''))}>
                  Link
                </Button>
              </div>
              {devForm ? (
                <div className='flex flex-col gap-2 rounded-md border p-2'>
                  <Input aria-label='Issue title' value={devForm.title} maxLength={200} onChange={e => setDevForm({ ...devForm, title: e.target.value })} />
                  <div className='flex gap-2'>
                    <select aria-label='Issue type' value={devForm.issueType} onChange={e => setDevForm({ ...devForm, issueType: e.target.value })} className={selectClass}>
                      {Object.entries(developmentTypeLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <select aria-label='Issue priority' value={devForm.priority} onChange={e => setDevForm({ ...devForm, priority: e.target.value })} className={selectClass}>
                      {HELPDESK_PRIORITIES.map(p => (
                        <option key={p} value={p}>
                          {label(priorityLabels, p)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Textarea aria-label='Issue description' rows={4} maxLength={20000} value={devForm.description} onChange={e => setDevForm({ ...devForm, description: e.target.value })} />
                  <Textarea aria-label='Customer impact' rows={2} maxLength={4000} value={devForm.customerImpact} onChange={e => setDevForm({ ...devForm, customerImpact: e.target.value })} placeholder='Customer impact' />
                  {developmentProviders.length ? (
                    <select aria-label='Push to tracker' value={devForm.push} onChange={e => setDevForm({ ...devForm, push: e.target.value })} className={selectClass}>
                      <option value=''>Keep in Forge only</option>
                      {developmentProviders.map(p => (
                        <option key={p.key} value={p.key}>
                          Also create in {p.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <p className='text-textSecondary text-xs'>Customer names and emails are never sent to external trackers.</p>
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      size='xs'
                      disabled={pending || devForm.title.trim().length < 4 || devForm.description.trim().length < 4}
                      onClick={() =>
                        run(
                          () =>
                            createDevelopmentIssueAction({
                              ticketId: ticket.id,
                              title: devForm.title,
                              description: devForm.description,
                              issueType: devForm.issueType,
                              priority: devForm.priority,
                              customerImpact: devForm.customerImpact,
                              errorIdentifiers: detail.technicalContext?.client_error_id || '',
                              pushToProvider: devForm.push || null
                            }),
                          'Development issue created and linked.',
                          () => setDevForm(null)
                        )
                      }
                    >
                      Create issue
                    </Button>
                    <Button type='button' size='xs' variant='ghost' onClick={() => setDevForm(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type='button'
                  size='xs'
                  variant='outline'
                  onClick={() =>
                    setDevForm({
                      title: ticket.subject,
                      issueType: ticket.disposition === 'feature_request' ? 'feature_request' : 'bug',
                      priority: ticket.priority,
                      description: ticket.description,
                      customerImpact: '',
                      push: ''
                    })
                  }
                >
                  Convert to development issue
                </Button>
              )}
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title='SLA'>
        {sla ? (
          <>
            <div className='flex items-center justify-between'>
              <Badge size='sm' variant={sla.state === 'breached' ? 'destructive' : sla.state === 'at_risk' ? 'accent' : 'outline'}>
                {label(slaLabels, sla.state)}
              </Badge>
              <span className='text-textSecondary text-xs'>
                {label(priorityLabels, sla.priority)} · {sla.hours_mode === 'business' ? 'business hours' : '24×7'}
              </span>
            </div>
            <dl className='grid grid-cols-[100px_1fr] gap-y-1 text-xs'>
              <dt className='text-textSecondary'>First response</dt>
              {/* SLA values are relative to "now" and can differ by a minute between server and browser. */}
              <dd suppressHydrationWarning>{sla.first_responded_at ? `Met ${new Date(sla.first_responded_at).toLocaleString()}` : dueIn(sla.first_response_due_at)}</dd>
              {sla.next_response_due_at ? (
                <>
                  <dt className='text-textSecondary'>Next response</dt>
                  <dd suppressHydrationWarning>{dueIn(sla.next_response_due_at)}</dd>
                </>
              ) : null}
              <dt className='text-textSecondary'>Resolution</dt>
              <dd suppressHydrationWarning>{sla.resolved_at ? `Resolved ${new Date(sla.resolved_at).toLocaleString()}` : sla.paused_at ? `Paused since ${new Date(sla.paused_at).toLocaleString()}` : dueIn(sla.resolution_due_at)}</dd>
              {sla.total_paused_seconds ? (
                <>
                  <dt className='text-textSecondary'>Paused total</dt>
                  <dd>{Math.round(sla.total_paused_seconds / 60)} min</dd>
                </>
              ) : null}
            </dl>
            <p className='text-textSecondary text-xs'>Pauses while waiting on the customer; keeps running while waiting on Forge.</p>
          </>
        ) : (
          <p className='text-textSecondary text-xs'>No SLA policy applies.</p>
        )}
      </Section>

      {detail.csat ? (
        <Section title='Customer satisfaction'>
          <p className='text-lg font-semibold'>{detail.csat.rating} / 5</p>
          {detail.csat.comment ? <p className='whitespace-pre-wrap'>{detail.csat.comment}</p> : null}
          <p className='text-textSecondary text-xs'>Submitted {new Date(detail.csat.submitted_at).toLocaleString()}. Ratings cannot be edited by staff.</p>
        </Section>
      ) : null}

      <Section title='History'>
        <ul className='flex max-h-64 flex-col gap-1 overflow-y-auto text-xs'>
          {[
            ...detail.statusHistory.map((h: any) => ({ at: h.created_at, text: `Status ${label(statusLabels, h.from_status)} → ${label(statusLabels, h.to_status)}${h.reason ? ` (${h.reason})` : ''}` })),
            ...detail.priorityHistory.map((h: any) => ({ at: h.created_at, text: `Priority ${label(priorityLabels, h.from_priority)} → ${label(priorityLabels, h.to_priority)}${h.reason ? ` (${h.reason})` : ''}` })),
            ...detail.assignments.map((a: any) => ({
              at: a.created_at,
              text: `Assignment: ${reference.staff.find((s: any) => s.user_id === a.to_user_id)?.name || (a.to_user_id ? 'staff' : 'unassigned')}${a.reason ? ` (${a.reason})` : ''}`
            }))
          ]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .map((h, i) => (
              <li key={i}>
                <span className='text-textSecondary'>{new Date(h.at).toLocaleString()}</span> — {h.text}
              </li>
            ))}
        </ul>
      </Section>
    </>
  )
}

const Attachments = ({ basePath, detail, permissions, run, pending }: Props) => {
  const { ticket } = detail
  const can = (key: string) => permissions.includes(key)

  return (
    <div className='flex flex-col gap-3'>
      {detail.attachments.length ? (
        <ul className='flex flex-col gap-2'>
          {detail.attachments.map((a: any) => (
            <li key={a.id} className='flex flex-wrap items-center justify-between gap-2 text-sm'>
              <span className='flex min-w-0 items-center gap-2'>
                {a.visibility === 'internal' ? <TbLock aria-label='Internal' className='text-warning shrink-0' /> : null}
                <span className='truncate'>{a.file_name}</span>
                <span className='text-textSecondary shrink-0 text-xs'>
                  {(a.byte_size / 1024).toFixed(0)} KB · {a.uploaded_by_name} · scan {a.scan_status}
                </span>
              </span>
              <span className='flex gap-1'>
                <Button asChild size='xs' variant='ghost'>
                  <a href={`${basePath}/api/helpdesk/attachments/${a.id}?inline=1`} target='_blank' rel='noreferrer'>
                    View
                  </a>
                </Button>
                <Button asChild size='xs' variant='ghost'>
                  <a href={`${basePath}/api/helpdesk/attachments/${a.id}`}>
                    <TbDownload />
                  </a>
                </Button>
                {can('helpdesk.support.respond') ? (
                  <Button
                    type='button'
                    size='xs'
                    variant='ghostDestructive'
                    disabled={pending}
                    onClick={() => {
                      const why = window.prompt(`Remove ${a.file_name}? The file is retained for audit but hidden. Reason:`)

                      if (why !== null) run(() => removeAttachmentAction({ ticketId: ticket.id, attachmentId: a.id, reason: why }), 'Attachment removed.')
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary text-sm'>No attachments.</p>
      )}
      {!ticket.merged_into_ticket_id && !['resolved', 'closed'].includes(ticket.status) ? <AttachmentUploader basePath={basePath} ticketId={ticket.id} allowInternal /> : null}
    </div>
  )
}

PropertiesPanel.Attachments = Attachments

export default PropertiesPanel
