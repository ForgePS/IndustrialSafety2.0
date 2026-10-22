'use client'

import { useState } from 'react'

import Link from 'next/link'
import { TbArrowLeft, TbX } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { componentStatusLabels, incidentImpactLabels, incidentStatusLabels, label } from '@/lib/forgeHelpdesk'
import { PriorityBadge, StatusBadge } from '@/components/helpdesk/HelpdeskBadges'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { linkIncidentTicketAction, postIncidentUpdateAction, setIncidentScopeAction } from '../../actions'
import { ComponentPicker, TenantPicker } from '../DeclareIncidentForm'

const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved']

const IncidentWorkspace = ({
  detail,
  components,
  tenants,
  canManage,
  canLink
}: {
  detail: any
  components: { id: string; name: string }[]
  tenants: { id: string; name: string }[]
  canManage: boolean
  canLink: boolean
}) => {
  const { incident } = detail
  const { pending, notice, run } = useActionRunner()
  const resolved = incident.status === 'resolved'

  const [status, setStatus] = useState(resolved ? 'resolved' : incident.status)
  const [message, setMessage] = useState('')
  const [isPublic, setIsPublic] = useState(incident.is_public)
  const [notify, setNotify] = useState(true)
  const [ticketAction, setTicketAction] = useState<'none' | 'waiting_on_customer' | 'resolved'>('none')
  const [resolution, setResolution] = useState({ resolution: '', root_cause: '', preventive_action: '' })

  const [editScope, setEditScope] = useState(false)
  const [scopeComponents, setScopeComponents] = useState<Record<string, string>>(Object.fromEntries(detail.components.map((c: any) => [c.component_id, c.component_status])))
  const [allTenants, setAllTenants] = useState<boolean>(incident.all_tenants_affected)
  const [tenantIds, setTenantIds] = useState<string[]>(detail.tenants.map((t: any) => t.organization_id))
  const [ticketRef, setTicketRef] = useState('')

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/help-desk/console/incidents' className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          Incidents
        </Link>
        <h1 className='text-textPrimary mt-1 text-2xl font-bold'>
          <span className='text-textSecondary mr-2 font-mono text-lg'>{incident.incident_number}</span>
          {incident.title}
        </h1>
        <div className='mt-2 flex flex-wrap items-center gap-2 text-sm'>
          <Badge size='sm' variant={resolved ? 'tonalSuccess' : 'destructive'}>
            {label(incidentStatusLabels, incident.status)}
          </Badge>
          <Badge size='sm' variant='outline'>
            {label(incidentImpactLabels, incident.impact)} impact
          </Badge>
          <span className='text-textSecondary'>
            Declared {new Date(incident.started_at).toLocaleString()}
            {incident.created_by_name ? ' by ' + incident.created_by_name : ''} · {incident.is_public ? 'public' : 'internal only'}
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
          {canManage && !resolved ? (
            <Card>
              <CardHeader>
                <CardTitle>Post update</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                <select aria-label='Incident status' value={status} onChange={e => setStatus(e.target.value)} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>
                      {label(incidentStatusLabels, s)}
                    </option>
                  ))}
                </select>
                <Textarea aria-label='Update message' rows={4} maxLength={4000} value={message} onChange={e => setMessage(e.target.value)} placeholder='What changed, what customers should do, and when the next update is.' />
                {status === 'resolved' ? (
                  <div className='flex flex-col gap-2 rounded-md border p-3'>
                    <Textarea aria-label='Resolution' rows={2} maxLength={4000} value={resolution.resolution} onChange={e => setResolution({ ...resolution, resolution: e.target.value })} placeholder='Resolution (required)' />
                    <Textarea aria-label='Root cause' rows={2} maxLength={4000} value={resolution.root_cause} onChange={e => setResolution({ ...resolution, root_cause: e.target.value })} placeholder='Root cause (internal)' />
                    <Textarea aria-label='Preventive action' rows={2} maxLength={4000} value={resolution.preventive_action} onChange={e => setResolution({ ...resolution, preventive_action: e.target.value })} placeholder='Preventive action (internal)' />
                  </div>
                ) : null}
                <div className='flex flex-wrap gap-6'>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                    Public update
                  </label>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch checked={notify} onCheckedChange={setNotify} disabled={!isPublic} />
                    Notify customers on linked tickets
                  </label>
                </div>
                <label className='flex flex-col gap-1 text-sm'>
                  Linked tickets ({detail.tickets.length})
                  <select value={ticketAction} onChange={e => setTicketAction(e.target.value as typeof ticketAction)} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                    <option value='none'>Leave ticket status unchanged</option>
                    <option value='waiting_on_customer'>Ask customers to confirm (waiting on customer)</option>
                    <option value='resolved'>Resolve linked tickets with this update</option>
                  </select>
                  <span className='text-textSecondary text-xs'>Tickets are never closed automatically; customers can still reply or reopen.</span>
                </label>
                <Button
                  type='button'
                  disabled={pending || message.trim().length < 2 || (status === 'resolved' && resolution.resolution.trim().length < 4)}
                  onClick={() =>
                    run(
                      () =>
                        postIncidentUpdateAction({
                          incidentId: incident.id,
                          status,
                          message,
                          isPublic,
                          notifyCustomers: isPublic && notify,
                          ticketAction,
                          expectedRowVersion: incident.row_version,
                          resolution: status === 'resolved' ? resolution : undefined
                        }),
                      'Update posted.',
                      () => setMessage('')
                    )
                  }
                >
                  Post update
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {resolved ? (
            <Card>
              <CardHeader>
                <CardTitle>Resolution</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-2 text-sm'>
                <p>
                  <strong>Resolved:</strong> {new Date(incident.resolved_at).toLocaleString()}
                </p>
                <p className='whitespace-pre-wrap'>{incident.resolution}</p>
                {incident.root_cause ? (
                  <p className='whitespace-pre-wrap'>
                    <strong>Root cause:</strong> {incident.root_cause}
                  </p>
                ) : null}
                {incident.preventive_action ? (
                  <p className='whitespace-pre-wrap'>
                    <strong>Preventive action:</strong> {incident.preventive_action}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className='flex flex-col gap-4 border-l pl-4'>
                {detail.updates.map((u: any) => (
                  <li key={u.id}>
                    <p className='text-sm font-semibold'>
                      {label(incidentStatusLabels, u.status)}{' '}
                      <span className='text-textSecondary font-normal'>
                        · {new Date(u.created_at).toLocaleString()} · {u.posted_by_name} · {u.is_public ? 'public' : 'internal'}
                        {u.tickets_updated ? ` · ${u.tickets_updated} ticket(s) updated` : ''}
                        {u.customers_notified ? ` · ${u.customers_notified} notified` : ''}
                      </span>
                    </p>
                    <p className='whitespace-pre-wrap text-sm'>{u.message}</p>
                  </li>
                ))}
                <li>
                  <p className='text-sm font-semibold'>Declared</p>
                  <p className='whitespace-pre-wrap text-sm'>{incident.public_message}</p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0'>
              <CardTitle className='text-base'>Scope</CardTitle>
              {canManage && !resolved && !editScope ? (
                <Button type='button' size='xs' variant='outline' onClick={() => setEditScope(true)}>
                  Edit
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              {editScope ? (
                <>
                  <ComponentPicker components={components} value={scopeComponents} onChange={setScopeComponents} />
                  <label className='flex items-center gap-2'>
                    <Switch checked={allTenants} onCheckedChange={setAllTenants} />
                    All tenants affected
                  </label>
                  {!allTenants ? <TenantPicker tenants={tenants} value={tenantIds} onChange={setTenantIds} /> : null}
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            setIncidentScopeAction({
                              incidentId: incident.id,
                              components: Object.entries(scopeComponents).map(([component_id, status]) => ({ component_id, status })),
                              tenantIds: allTenants ? [] : tenantIds,
                              allTenants
                            }),
                          'Scope updated.',
                          () => setEditScope(false)
                        )
                      }
                    >
                      Save scope
                    </Button>
                    <Button type='button' size='sm' variant='ghost' onClick={() => setEditScope(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className='text-textSecondary text-xs font-medium'>Components</p>
                    {detail.components.length ? (
                      <ul>
                        {detail.components.map((c: any) => (
                          <li key={c.component_id}>
                            {c.component?.name} — {label(componentStatusLabels, c.component_status)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None selected</p>
                    )}
                    {incident.other_component_note ? <p className='text-textSecondary'>Other: {incident.other_component_note}</p> : null}
                  </div>
                  <div>
                    <p className='text-textSecondary text-xs font-medium'>Tenants</p>
                    <p>{incident.all_tenants_affected ? 'All tenants' : detail.tenants.map((t: any) => t.name).join(', ') || 'None selected'}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Linked tickets ({detail.tickets.length})</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-2 text-sm'>
              {detail.tickets.map((l: any) => (
                <div key={l.id} className='flex items-start justify-between gap-2'>
                  <Link href={`/help-desk/console/tickets/${l.ticket.id}`} className='min-w-0'>
                    <span className='text-primary font-medium'>{l.ticket.ticket_number}</span> {l.ticket.subject}
                    <span className='mt-1 flex flex-wrap items-center gap-1'>
                      <StatusBadge status={l.ticket.status} />
                      <PriorityBadge priority={l.ticket.priority} />
                      <span className='text-textSecondary text-xs'>{l.ticket.organization?.name}</span>
                    </span>
                  </Link>
                  {canLink ? (
                    <button type='button' aria-label={`Unlink ${l.ticket.ticket_number}`} disabled={pending} onClick={() => run(() => linkIncidentTicketAction({ incidentId: incident.id, ticket: l.ticket.id, link: false }), 'Ticket unlinked.')}>
                      <TbX />
                    </button>
                  ) : null}
                </div>
              ))}
              {!detail.tickets.length ? <p className='text-textSecondary'>No tickets linked yet.</p> : null}
              {canLink && !resolved ? (
                <div className='flex gap-2 pt-2'>
                  <Input aria-label='Ticket number' value={ticketRef} onChange={e => setTicketRef(e.target.value)} placeholder='SUP-2026-000123' className='h-[34px]' />
                  <Button type='button' size='sm' variant='outline' disabled={pending || !ticketRef.trim()} onClick={() => run(() => linkIncidentTicketAction({ incidentId: incident.id, ticket: ticketRef, link: true }), 'Ticket linked.', () => setTicketRef(''))}>
                    Link
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default IncidentWorkspace
