'use client'

import { useState } from 'react'

import Link from 'next/link'
import { TbArrowLeft, TbX } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { developmentProviderLabels, developmentStateLabels, developmentTypeLabels, HELPDESK_PRIORITIES, label, priorityLabels } from '@/lib/forgeHelpdesk'
import { PriorityBadge, StatusBadge } from '@/components/helpdesk/HelpdeskBadges'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { linkDevelopmentIssueAction, updateDevelopmentIssueAction } from '../../actions'

const selectClass = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const DevelopmentIssueView = ({ detail }: { detail: any }) => {
  const { issue } = detail
  const { pending, notice, run } = useActionRunner()

  const [form, setForm] = useState({
    state: issue.state,
    priority: issue.priority,
    fixVersion: issue.fix_version || '',
    externalProvider: issue.external_provider === 'forge_internal' ? '' : issue.external_provider,
    externalIssueId: issue.external_issue_id || '',
    externalUrl: issue.external_url || '',
    note: '',
    customerUpdate: ''
  })

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  const save = () =>
    run(
      () =>
        updateDevelopmentIssueAction({
          issueId: issue.id,
          expectedRowVersion: issue.row_version,
          state: form.state !== issue.state ? form.state : undefined,
          priority: form.priority !== issue.priority ? form.priority : undefined,
          fixVersion: form.fixVersion !== (issue.fix_version || '') ? form.fixVersion : undefined,
          ...(form.externalProvider && (form.externalIssueId !== (issue.external_issue_id || '') || form.externalUrl !== (issue.external_url || '') || form.externalProvider !== issue.external_provider)
            ? { externalProvider: form.externalProvider, externalIssueId: form.externalIssueId, externalUrl: form.externalUrl }
            : {}),
          note: form.note,
          customerUpdate: form.customerUpdate
        }),
      'Development issue updated.',
      () => set({ note: '', customerUpdate: '' })
    )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/help-desk/console/development' className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          Development issues
        </Link>
        <h1 className='text-textPrimary mt-1 text-2xl font-bold'>
          <span className='text-textSecondary mr-2 font-mono text-lg'>{issue.issue_number}</span>
          {issue.title}
        </h1>
        <div className='mt-2 flex flex-wrap items-center gap-2 text-sm'>
          <Badge size='sm' variant='outline'>
            {label(developmentTypeLabels, issue.issue_type)}
          </Badge>
          <Badge size='sm' variant={['fixed', 'released'].includes(issue.state) ? 'tonalSuccess' : 'outline'}>
            {label(developmentStateLabels, issue.state)}
          </Badge>
          <PriorityBadge priority={issue.priority} />
          <span className='text-textSecondary'>
            {label(developmentProviderLabels, issue.external_provider)}
            {issue.external_url ? (
              <>
                {' · '}
                <a className='text-primary underline' href={issue.external_url} target='_blank' rel='noreferrer'>
                  {issue.external_issue_id || 'open'}
                </a>
              </>
            ) : null}
            {issue.linked_by_name ? ` · linked by ${issue.linked_by_name}` : ''}
          </span>
        </div>
      </div>

      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
          {notice.text}
        </p>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-3'>
        <div className='flex flex-col gap-6 lg:col-span-2'>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              <p className='whitespace-pre-wrap'>{issue.description}</p>
              {issue.customer_impact ? (
                <p className='whitespace-pre-wrap'>
                  <strong>Customer impact:</strong> {issue.customer_impact}
                </p>
              ) : null}
              {issue.reproduction_steps ? (
                <p className='whitespace-pre-wrap'>
                  <strong>Reproduction:</strong> {issue.reproduction_steps}
                </p>
              ) : null}
              {issue.error_identifiers ? (
                <p>
                  <strong>Error identifiers:</strong> <code>{issue.error_identifiers}</code>
                </p>
              ) : null}
              {issue.customer_update ? (
                <p className='bg-primary/5 rounded-md p-3'>
                  <strong>Latest customer-approved update:</strong> {issue.customer_update}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <div className='grid gap-3 md:grid-cols-3'>
                <label className='flex flex-col gap-1 text-sm font-medium'>
                  State
                  <select value={form.state} onChange={e => set({ state: e.target.value })} className={selectClass}>
                    {Object.entries(developmentStateLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='flex flex-col gap-1 text-sm font-medium'>
                  Priority
                  <select value={form.priority} onChange={e => set({ priority: e.target.value })} className={selectClass}>
                    {HELPDESK_PRIORITIES.map(p => (
                      <option key={p} value={p}>
                        {label(priorityLabels, p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='flex flex-col gap-1 text-sm font-medium'>
                  Fix version
                  <Input maxLength={80} value={form.fixVersion} onChange={e => set({ fixVersion: e.target.value })} placeholder='e.g. 2.4.1' />
                </label>
              </div>
              <fieldset className='grid gap-3 rounded-md border p-3 md:grid-cols-3'>
                <legend className='px-1 text-xs font-medium'>External tracker link</legend>
                <select aria-label='External provider' value={form.externalProvider} onChange={e => set({ externalProvider: e.target.value })} className={selectClass}>
                  <option value=''>Forge internal only</option>
                  {Object.entries(developmentProviderLabels)
                    .filter(([k]) => k !== 'forge_internal')
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
                <Input aria-label='External issue ID' maxLength={120} value={form.externalIssueId} onChange={e => set({ externalIssueId: e.target.value })} placeholder='Issue ID' disabled={!form.externalProvider} />
                <Input aria-label='External URL' maxLength={500} value={form.externalUrl} onChange={e => set({ externalUrl: e.target.value })} placeholder='https://…' disabled={!form.externalProvider} />
              </fieldset>
              <Textarea aria-label='Internal note' rows={2} maxLength={4000} value={form.note} onChange={e => set({ note: e.target.value })} placeholder='Internal note (not shared)' />
              <Textarea aria-label='Customer update' rows={2} maxLength={2000} value={form.customerUpdate} onChange={e => set({ customerUpdate: e.target.value })} placeholder='Approved customer update (optional): posted to open linked tickets as an engineering update' />
              <div>
                <Button type='button' disabled={pending} onClick={save}>
                  Save update
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className='flex flex-col gap-3 border-l pl-4 text-sm'>
                {detail.updates.map((u: any) => (
                  <li key={u.id}>
                    <p className='text-xs'>
                      <strong>{u.created_by_name}</strong> · {new Date(u.created_at).toLocaleString()}
                      {u.to_state && u.to_state !== u.from_state ? ` · ${label(developmentStateLabels, u.from_state)} → ${label(developmentStateLabels, u.to_state)}` : ''}
                      {u.shared_with_customers ? ' · shared with customers' : ''}
                    </p>
                    {u.note ? <p className='whitespace-pre-wrap'>{u.note}</p> : null}
                  </li>
                ))}
                <li>
                  <p className='text-xs'>
                    Created {new Date(issue.created_at).toLocaleString()}
                    {issue.created_by_name ? ' by ' + issue.created_by_name : ''}
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Linked tickets ({detail.links.length})</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3 text-sm'>
            {detail.links.map((l: any) => (
              <div key={l.id} className='flex items-start justify-between gap-2'>
                <Link href={`/help-desk/console/tickets/${l.ticket.id}`} className='min-w-0'>
                  <span className='text-primary font-medium'>{l.ticket.ticket_number}</span> {l.ticket.subject}
                  <span className='mt-1 flex flex-wrap items-center gap-1'>
                    <StatusBadge status={l.ticket.status} />
                    <PriorityBadge priority={l.ticket.priority} />
                    <span className='text-textSecondary text-xs'>{l.ticket.organization?.name}</span>
                  </span>
                </Link>
                <button type='button' aria-label={`Unlink ${l.ticket.ticket_number}`} disabled={pending} onClick={() => run(() => linkDevelopmentIssueAction({ issueId: issue.id, ticketId: l.ticket.id, link: false }), 'Ticket unlinked.')}>
                  <TbX />
                </button>
              </div>
            ))}
            {!detail.links.length ? <p className='text-textSecondary'>No tickets linked. Link from a ticket workspace.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DevelopmentIssueView
