'use client'

import { useState } from 'react'

import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Switch } from '@repo/ui/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/ui/tabs'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { formatDuration, HELPDESK_PRIORITIES, label, priorityLabels, SAVED_REPLY_PLACEHOLDERS } from '@/lib/forgeHelpdesk'
import { useActionRunner, type Notice } from '@/components/helpdesk/useActionRunner'
import { saveCatalogItemAction, saveGeneralSettingsAction, saveSavedReplyAction, saveSlaPolicyAction, saveTagAction, setTeamMemberAction } from '../actions'

const selectClass = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const NoticeLine = ({ notice }: { notice: Notice }) =>
  notice ? (
    <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
      {notice.text}
    </p>
  ) : null

// ---------------------------------------------------------------------------
const GeneralSettings = ({ settings }: { settings: any }) => {
  const { pending, notice, run } = useActionRunner()

  const [form, setForm] = useState({
    reopenWindowDays: settings.reopen_window_days,
    allowCustomerClose: settings.allow_customer_close,
    csatEnabled: settings.csat_enabled,
    captureTechnicalContext: settings.capture_technical_context,
    aiAnswerMode: settings.ai_answer_mode,
    emailNotificationsEnabled: settings.email_notifications_enabled,
    attachmentMaxMb: settings.attachment_max_mb,
    videoMaxMb: settings.video_max_mb
  })

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  const toggles: [keyof typeof form, string, string][] = [
    ['allowCustomerClose', 'Customers can close tickets', 'Let requesters close their own tickets.'],
    ['csatEnabled', 'Satisfaction surveys', 'Ask requesters to rate resolved tickets (1–5).'],
    ['captureTechnicalContext', 'Capture technical context', 'Browser, device and route details (never secrets or tokens).'],
    ['emailNotificationsEnabled', 'Email notifications', 'Send email in addition to in-app notifications.']
  ]

  return (
    <Card>
      <CardContent className='flex flex-col gap-4 p-6'>
        {toggles.map(([key, title, help]) => (
          <label key={key} className='flex items-start justify-between gap-4'>
            <span>
              <span className='block font-medium'>{title}</span>
              <span className='text-textSecondary text-sm'>{help}</span>
            </span>
            <Switch checked={Boolean(form[key])} onCheckedChange={v => set({ [key]: v } as Partial<typeof form>)} />
          </label>
        ))}
        <div className='grid gap-4 md:grid-cols-4'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Reopen window (days)
            <Input type='number' min={1} max={365} value={form.reopenWindowDays} onChange={e => set({ reopenWindowDays: Number(e.target.value) })} />
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Ask Forge answers
            <select value={form.aiAnswerMode} onChange={e => set({ aiAnswerMode: e.target.value })} className={selectClass}>
              <option value='auto'>AI provider when configured</option>
              <option value='knowledge_only'>Knowledge base only</option>
              <option value='disabled'>Disabled</option>
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Max file size (MB)
            <Input type='number' min={1} max={25} value={form.attachmentMaxMb} onChange={e => set({ attachmentMaxMb: Number(e.target.value) })} />
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Max video size (MB)
            <Input type='number' min={1} max={25} value={form.videoMaxMb} onChange={e => set({ videoMaxMb: Number(e.target.value) })} />
          </label>
        </div>
        <NoticeLine notice={notice} />
        <div>
          <Button type='button' disabled={pending} onClick={() => run(() => saveGeneralSettingsAction(form), 'Settings saved.')}>
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
const SlaPolicies = ({ policies, calendars, tenants }: { policies: any[]; calendars: any[]; tenants: { id: string; name: string }[] }) => {
  const { pending, notice, run } = useActionRunner()
  const blank = { policyId: null as string | null, expectedRowVersion: null as number | null, name: '', priority: 'p3_normal', organizationId: '', firstResponseMinutes: 480, nextResponseMinutes: 480, resolutionMinutes: 2880, hoursMode: 'business' as 'business' | 'calendar', calendarId: calendars[0]?.id || '', pauseOnWaitingCustomer: true, atRiskPercent: 75, isActive: true }
  const [draft, setDraft] = useState<typeof blank | null>(null)
  const set = (patch: Partial<typeof blank>) => setDraft(d => (d ? { ...d, ...patch } : d))

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0'>
        <CardTitle className='text-base'>SLA policies</CardTitle>
        {!draft ? (
          <Button type='button' size='sm' onClick={() => setDraft({ ...blank })}>
            New policy / tenant override
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <p className='text-textSecondary text-sm'>Tenant-specific policies override the platform default for that priority. The SLA pauses while waiting on the customer and keeps running while waiting on Forge.</p>
        {draft ? (
          <div className='grid gap-3 rounded-md border p-4 md:grid-cols-3'>
            <Input aria-label='Policy name' value={draft.name} maxLength={120} onChange={e => set({ name: e.target.value })} placeholder='Policy name' />
            <select aria-label='Priority' value={draft.priority} onChange={e => set({ priority: e.target.value })} className={selectClass}>
              {HELPDESK_PRIORITIES.map(p => (
                <option key={p} value={p}>
                  {label(priorityLabels, p)}
                </option>
              ))}
            </select>
            <select aria-label='Scope' value={draft.organizationId} onChange={e => set({ organizationId: e.target.value })} className={selectClass}>
              <option value=''>Platform default</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>
                  Override for {t.name}
                </option>
              ))}
            </select>
            <label className='flex flex-col gap-1 text-xs'>
              First response (min)
              <Input type='number' min={1} value={draft.firstResponseMinutes} onChange={e => set({ firstResponseMinutes: Number(e.target.value) })} />
            </label>
            <label className='flex flex-col gap-1 text-xs'>
              Next response (min)
              <Input type='number' min={1} value={draft.nextResponseMinutes} onChange={e => set({ nextResponseMinutes: Number(e.target.value) })} />
            </label>
            <label className='flex flex-col gap-1 text-xs'>
              Resolution (min)
              <Input type='number' min={1} value={draft.resolutionMinutes} onChange={e => set({ resolutionMinutes: Number(e.target.value) })} />
            </label>
            <select aria-label='Hours mode' value={draft.hoursMode} onChange={e => set({ hoursMode: e.target.value as 'business' | 'calendar' })} className={selectClass}>
              <option value='business'>Business hours</option>
              <option value='calendar'>Calendar hours (24×7)</option>
            </select>
            {draft.hoursMode === 'business' ? (
              <select aria-label='Business calendar' value={draft.calendarId} onChange={e => set({ calendarId: e.target.value })} className={selectClass}>
                {calendars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.timezone})
                  </option>
                ))}
              </select>
            ) : (
              <span />
            )}
            <label className='flex flex-col gap-1 text-xs'>
              At-risk threshold (%)
              <Input type='number' min={10} max={95} value={draft.atRiskPercent} onChange={e => set({ atRiskPercent: Number(e.target.value) })} />
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={draft.pauseOnWaitingCustomer} onCheckedChange={v => set({ pauseOnWaitingCustomer: v })} />
              Pause while waiting on customer
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={draft.isActive} onCheckedChange={v => set({ isActive: v })} />
              Active
            </label>
            <div className='flex gap-2 md:col-span-3'>
              <Button type='button' disabled={pending} onClick={() => run(() => saveSlaPolicyAction({ ...draft, organizationId: draft.organizationId || null }), 'SLA policy saved.', () => setDraft(null))}>
                Save policy
              </Button>
              <Button type='button' variant='ghost' onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        <NoticeLine notice={notice} />
        <div className='flex flex-col divide-y'>
          {policies.map(p => (
            <div key={p.id} className='flex flex-wrap items-center justify-between gap-2 py-2 text-sm'>
              <div>
                <p className='font-medium'>
                  {p.name} <span className='text-textSecondary font-normal'>· {label(priorityLabels, p.priority)}</span>
                </p>
                <p className='text-textSecondary text-xs'>
                  {p.organization?.name ? `Override for ${p.organization.name}` : 'Platform default'} · first {formatDuration(p.first_response_minutes)} · next {formatDuration(p.next_response_minutes)} · resolve{' '}
                  {formatDuration(p.resolution_minutes)} · {p.hours_mode === 'business' ? 'business hours' : '24×7'} · at risk {p.at_risk_percent}%
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {!p.is_active ? <Badge size='sm' variant='outline'>Inactive</Badge> : null}
                <Button
                  type='button'
                  size='xs'
                  variant='outline'
                  onClick={() =>
                    setDraft({
                      policyId: p.id,
                      expectedRowVersion: p.row_version,
                      name: p.name,
                      priority: p.priority,
                      organizationId: p.organization_id || '',
                      firstResponseMinutes: p.first_response_minutes,
                      nextResponseMinutes: p.next_response_minutes || p.first_response_minutes,
                      resolutionMinutes: p.resolution_minutes,
                      hoursMode: p.hours_mode,
                      calendarId: p.calendar_id || calendars[0]?.id || '',
                      pauseOnWaitingCustomer: p.pause_on_waiting_customer,
                      atRiskPercent: p.at_risk_percent,
                      isActive: p.is_active
                    })
                  }
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
const CatalogEditor = ({ kind, items }: { kind: 'category' | 'area'; items: any[] }) => {
  const { pending, notice, run } = useActionRunner()
  const blank = { id: null as string | null, label: '', key: '', description: '', defaultPriority: '', isActive: true, sortOrder: (items.length + 1) * 10 }
  const [draft, setDraft] = useState<typeof blank | null>(null)
  const set = (patch: Partial<typeof blank>) => setDraft(d => (d ? { ...d, ...patch } : d))
  const title = kind === 'category' ? 'Request types' : 'Product areas'

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {!draft ? (
          <Button type='button' size='sm' onClick={() => setDraft({ ...blank })}>
            Add
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {draft ? (
          <div className='grid gap-2 rounded-md border p-3 md:grid-cols-2'>
            <Input aria-label='Label' value={draft.label} maxLength={120} onChange={e => set({ label: e.target.value })} placeholder='Label' />
            {!draft.id ? <Input aria-label='Key' value={draft.key} maxLength={60} onChange={e => set({ key: e.target.value })} placeholder='Key (optional, generated from label)' /> : <span />}
            {kind === 'category' ? (
              <>
                <Input aria-label='Description' value={draft.description} maxLength={300} onChange={e => set({ description: e.target.value })} placeholder='Help text shown to customers' />
                <select aria-label='Default priority' value={draft.defaultPriority} onChange={e => set({ defaultPriority: e.target.value })} className={selectClass}>
                  <option value=''>Use customer severity</option>
                  {HELPDESK_PRIORITIES.map(p => (
                    <option key={p} value={p}>
                      Default {label(priorityLabels, p)}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <Input aria-label='Sort order' type='number' value={draft.sortOrder} onChange={e => set({ sortOrder: Number(e.target.value) })} />
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={draft.isActive} onCheckedChange={v => set({ isActive: v })} />
              Active
            </label>
            <div className='flex gap-2 md:col-span-2'>
              <Button type='button' size='sm' disabled={pending} onClick={() => run(() => saveCatalogItemAction({ kind, ...draft, defaultPriority: draft.defaultPriority || null }), 'Saved.', () => setDraft(null))}>
                Save
              </Button>
              <Button type='button' size='sm' variant='ghost' onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        <NoticeLine notice={notice} />
        <div className='flex flex-col divide-y text-sm'>
          {items.map(item => (
            <div key={item.id} className='flex items-center justify-between gap-2 py-1.5'>
              <span>
                {item.label} <span className='text-textSecondary text-xs'>({kind === 'category' ? item.category_key : item.area_key})</span>
                {!item.is_active ? <span className='text-textSecondary ml-1 text-xs'>· inactive</span> : null}
              </span>
              <Button
                type='button'
                size='xs'
                variant='ghost'
                onClick={() => setDraft({ id: item.id, label: item.label, key: '', description: item.description || '', defaultPriority: item.default_priority || '', isActive: item.is_active, sortOrder: item.sort_order })}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
const TagEditor = ({ tags }: { tags: any[] }) => {
  const { pending, notice, run } = useActionRunner()
  const [draft, setDraft] = useState<{ tagId: string | null; label: string; description: string; color: string; isActive: boolean } | null>(null)

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0'>
        <CardTitle className='text-base'>Tags</CardTitle>
        {!draft ? (
          <Button type='button' size='sm' onClick={() => setDraft({ tagId: null, label: '', description: '', color: '#64748b', isActive: true })}>
            New tag
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {draft ? (
          <div className='flex flex-wrap items-center gap-2 rounded-md border p-3'>
            <Input aria-label='Tag label' value={draft.label} maxLength={60} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder='Label' className='w-48' />
            <Input aria-label='Tag description' value={draft.description} maxLength={300} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder='Description' className='flex-1' />
            <input aria-label='Tag color' type='color' value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} className='h-[38px] w-12 rounded border' />
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={draft.isActive} onCheckedChange={v => setDraft({ ...draft, isActive: v })} />
              Active
            </label>
            <Button type='button' size='sm' disabled={pending} onClick={() => run(() => saveTagAction(draft), 'Tag saved.', () => setDraft(null))}>
              Save
            </Button>
            <Button type='button' size='sm' variant='ghost' onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        ) : null}
        <NoticeLine notice={notice} />
        <div className='flex flex-wrap gap-2'>
          {tags.map(t => (
            <button key={t.id} type='button' onClick={() => setDraft({ tagId: t.id, label: t.label, description: t.description || '', color: t.color || '#64748b', isActive: t.is_active })}>
              <Badge size='sm' variant='outline' style={t.color ? { borderColor: t.color } : undefined} className={t.is_active ? '' : 'opacity-50'}>
                {t.label}
              </Badge>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
const SavedReplies = ({ replies, teams }: { replies: any[]; teams: any[] }) => {
  const { pending, notice, run } = useActionRunner()
  const [draft, setDraft] = useState<{ replyId: string | null; expectedRowVersion: number | null; name: string; category: string; body: string; teamId: string; isActive: boolean } | null>(null)

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0'>
        <CardTitle className='text-base'>Saved replies</CardTitle>
        {!draft ? (
          <Button type='button' size='sm' onClick={() => setDraft({ replyId: null, expectedRowVersion: null, name: '', category: 'general', body: '', teamId: '', isActive: true })}>
            New saved reply
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {draft ? (
          <div className='flex flex-col gap-2 rounded-md border p-3'>
            <div className='grid gap-2 md:grid-cols-3'>
              <Input aria-label='Name' value={draft.name} maxLength={120} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder='Name' />
              <Input aria-label='Category' value={draft.category} maxLength={60} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder='Category' />
              <select aria-label='Team' value={draft.teamId} onChange={e => setDraft({ ...draft, teamId: e.target.value })} className={selectClass}>
                <option value=''>All teams</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <Textarea aria-label='Body' rows={6} maxLength={10000} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
            <p className='text-textSecondary text-xs'>Placeholders: {SAVED_REPLY_PLACEHOLDERS.map(p => `{{${p}}}`).join(', ')}</p>
            <label className='flex items-center gap-2 text-sm'>
              <Switch checked={draft.isActive} onCheckedChange={v => setDraft({ ...draft, isActive: v })} />
              Active
            </label>
            <div className='flex gap-2'>
              <Button type='button' size='sm' disabled={pending} onClick={() => run(() => saveSavedReplyAction({ ...draft, teamId: draft.teamId || null }), 'Saved reply saved.', () => setDraft(null))}>
                Save
              </Button>
              <Button type='button' size='sm' variant='ghost' onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        <NoticeLine notice={notice} />
        <div className='flex flex-col divide-y text-sm'>
          {replies.map(r => (
            <div key={r.id} className='flex items-start justify-between gap-2 py-2'>
              <div className='min-w-0'>
                <p className='font-medium'>
                  {r.name} <span className='text-textSecondary text-xs font-normal'>· {r.category}</span>
                  {!r.is_active ? <span className='text-textSecondary text-xs font-normal'> · inactive</span> : null}
                </p>
                <p className='text-textSecondary line-clamp-2 text-xs'>{r.body}</p>
              </div>
              <Button
                type='button'
                size='xs'
                variant='ghost'
                onClick={() => setDraft({ replyId: r.id, expectedRowVersion: r.row_version, name: r.name, category: r.category, body: r.body, teamId: r.team_id || '', isActive: r.is_active })}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
const Teams = ({ teams, members, staff }: { teams: any[]; members: any[]; staff: any[] }) => {
  const { pending, notice, run } = useActionRunner()

  return (
    <div className='flex flex-col gap-4'>
      <NoticeLine notice={notice} />
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {teams.map(team => {
          const teamMembers = members.filter(m => m.team_id === team.id)

          return (
            <Card key={team.id}>
              <CardHeader>
                <CardTitle className='text-base'>
                  {team.name} {team.is_default_triage ? <span className='text-textSecondary text-xs font-normal'>(default triage)</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-2 text-sm'>
                {team.description ? <p className='text-textSecondary text-xs'>{team.description}</p> : null}
                {teamMembers.map(m => (
                  <div key={m.user_id} className='flex items-center justify-between gap-2'>
                    <span>
                      {staff.find(s => s.user_id === m.user_id)?.name || 'Forge staff'}
                      {m.is_lead ? <span className='text-textSecondary text-xs'> · lead</span> : null}
                    </span>
                    <Button type='button' size='xs' variant='ghost' disabled={pending} onClick={() => run(() => setTeamMemberAction({ teamId: team.id, userId: m.user_id, member: false }), 'Member removed.')}>
                      Remove
                    </Button>
                  </div>
                ))}
                {!teamMembers.length ? <p className='text-textSecondary text-xs'>No members.</p> : null}
                <select
                  aria-label={`Add member to ${team.name}`}
                  value=''
                  onChange={e => e.target.value && run(() => setTeamMemberAction({ teamId: team.id, userId: e.target.value, member: true }), 'Member added.')}
                  className={selectClass}
                >
                  <option value=''>Add member…</option>
                  {staff
                    .filter(s => !teamMembers.some(m => m.user_id === s.user_id))
                    .map(s => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
const SettingsTabs = ({ data, tenants, permissions }: { data: any; tenants: { id: string; name: string }[]; permissions: string[] }) => {
  const can = (key: string) => permissions.includes(key)

  const tabs = [
    { key: 'general', label: 'General', visible: can('helpdesk.admin.manage') },
    { key: 'sla', label: 'SLA', visible: can('helpdesk.admin.sla') },
    { key: 'catalog', label: 'Catalog', visible: can('helpdesk.admin.categories') },
    { key: 'tags', label: 'Tags', visible: can('helpdesk.admin.tags') },
    { key: 'replies', label: 'Saved replies', visible: can('helpdesk.admin.templates') },
    { key: 'teams', label: 'Teams', visible: can('helpdesk.admin.manage') }
  ].filter(t => t.visible)

  if (!tabs.length) return <p className='text-textSecondary text-sm'>You do not have permission to change Help Desk settings.</p>

  return (
    <Tabs defaultValue={tabs[0].key}>
      <TabsList className='flex-wrap'>
        {tabs.map(t => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value='general'>
        <GeneralSettings settings={data.settings} />
      </TabsContent>
      <TabsContent value='sla'>
        <SlaPolicies policies={data.policies} calendars={data.calendars} tenants={tenants} />
      </TabsContent>
      <TabsContent value='catalog' className='grid gap-4 lg:grid-cols-2'>
        <CatalogEditor kind='category' items={data.catalog.categories} />
        <CatalogEditor kind='area' items={data.catalog.areas} />
      </TabsContent>
      <TabsContent value='tags'>
        <TagEditor tags={data.tags} />
      </TabsContent>
      <TabsContent value='replies'>
        <SavedReplies replies={data.replies} teams={data.teams} />
      </TabsContent>
      <TabsContent value='teams'>
        <Teams teams={data.teams} members={data.members} staff={data.staff} />
      </TabsContent>
    </Tabs>
  )
}

export default SettingsTabs
