'use client'

import { useState } from 'react'

import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { announcementTypeLabels, label } from '@/lib/forgeHelpdesk'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { saveAnnouncementAction } from '../actions'

type Draft = {
  id: string | null
  rowVersion: number | null
  title: string
  body: string
  type: string
  audience: 'all_users' | 'tenant_admins'
  organizationId: string
  startsAt: string
  endsAt: string
  isActive: boolean
  publish: boolean
  incidentId: string
}

const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

const blank: Draft = { id: null, rowVersion: null, title: '', body: '', type: 'platform_update', audience: 'all_users', organizationId: '', startsAt: '', endsAt: '', isActive: true, publish: true, incidentId: '' }

const AnnouncementManager = ({ announcements, tenants, incidents }: { announcements: any[]; tenants: { id: string; name: string }[]; incidents: { id: string; label: string }[] }) => {
  const { pending, notice, run } = useActionRunner()
  const [draft, setDraft] = useState<Draft | null>(null)
  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d))

  const edit = (a: any) =>
    setDraft({
      id: a.id,
      rowVersion: a.row_version,
      title: a.title,
      body: a.body,
      type: a.announcement_type,
      audience: a.audience,
      organizationId: a.organization_id || '',
      startsAt: toLocal(a.starts_at),
      endsAt: toLocal(a.ends_at),
      isActive: a.is_active,
      publish: !!a.published_at,
      incidentId: a.incident_id || ''
    })

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0'>
        <CardTitle>Announcements</CardTitle>
        {!draft ? (
          <Button type='button' size='sm' onClick={() => setDraft({ ...blank })}>
            New announcement
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {draft ? (
          <div className='flex flex-col gap-3 rounded-md border p-4'>
            <div className='grid gap-3 md:grid-cols-2'>
              <Input aria-label='Announcement title' maxLength={200} value={draft.title} onChange={e => set({ title: e.target.value })} placeholder='Title' />
              <select aria-label='Announcement type' value={draft.type} onChange={e => set({ type: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                {Object.entries(announcementTypeLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <Textarea aria-label='Announcement body' rows={4} maxLength={4000} value={draft.body} onChange={e => set({ body: e.target.value })} placeholder='Message shown to customers' />
            <div className='grid gap-3 md:grid-cols-3'>
              <select aria-label='Audience tenant' value={draft.organizationId} onChange={e => set({ organizationId: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                <option value=''>All tenants</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} only
                  </option>
                ))}
              </select>
              <select aria-label='Audience role' value={draft.audience} onChange={e => set({ audience: e.target.value as Draft['audience'] })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                <option value='all_users'>All users</option>
                <option value='tenant_admins'>Tenant administrators</option>
              </select>
              <select aria-label='Related incident' value={draft.incidentId} onChange={e => set({ incidentId: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                <option value=''>No related incident</option>
                {incidents.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
              <label className='flex flex-col gap-1 text-xs'>
                Starts
                <Input type='datetime-local' value={draft.startsAt} onChange={e => set({ startsAt: e.target.value })} />
              </label>
              <label className='flex flex-col gap-1 text-xs'>
                Ends (optional)
                <Input type='datetime-local' value={draft.endsAt} onChange={e => set({ endsAt: e.target.value })} />
              </label>
            </div>
            <div className='flex flex-wrap gap-6'>
              <label className='flex items-center gap-2 text-sm'>
                <Switch checked={draft.publish} onCheckedChange={v => set({ publish: v })} />
                Published
              </label>
              <label className='flex items-center gap-2 text-sm'>
                <Switch checked={draft.isActive} onCheckedChange={v => set({ isActive: v })} />
                Active
              </label>
            </div>
            <div className='flex gap-2'>
              <Button
                type='button'
                disabled={pending || draft.title.trim().length < 4 || draft.body.trim().length < 4}
                onClick={() =>
                  run(
                    () =>
                      saveAnnouncementAction({
                        announcementId: draft.id,
                        expectedRowVersion: draft.rowVersion,
                        title: draft.title,
                        body: draft.body,
                        announcementType: draft.type,
                        audience: draft.audience,
                        organizationId: draft.organizationId || null,
                        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
                        endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
                        isActive: draft.isActive,
                        publish: draft.publish,
                        incidentId: draft.incidentId || null
                      }),
                    'Announcement saved.',
                    () => setDraft(null)
                  )
                }
              >
                Save announcement
              </Button>
              <Button type='button' variant='ghost' onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {notice ? (
          <p role='status' className={notice.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
            {notice.text}
          </p>
        ) : null}
        <div className='flex flex-col divide-y'>
          {announcements.map(a => (
            <div key={a.id} className='flex flex-wrap items-center justify-between gap-2 py-2'>
              <div className='min-w-0'>
                <p className='truncate font-medium'>{a.title}</p>
                <p className='text-textSecondary text-xs'>
                  {label(announcementTypeLabels, a.announcement_type)} · {a.organization?.name || 'All tenants'} · {a.audience === 'tenant_admins' ? 'admins' : 'all users'} · starts {new Date(a.starts_at).toLocaleString()}
                  {a.ends_at ? ' · ends ' + new Date(a.ends_at).toLocaleString() : ''}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Badge size='sm' variant={a.published_at && a.is_active ? 'tonalSuccess' : 'outline'}>
                  {!a.is_active ? 'Inactive' : a.published_at ? 'Published' : 'Draft'}
                </Badge>
                <Button type='button' size='xs' variant='outline' onClick={() => edit(a)}>
                  Edit
                </Button>
              </div>
            </div>
          ))}
          {!announcements.length ? <p className='text-textSecondary text-sm'>No announcements yet.</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default AnnouncementManager
