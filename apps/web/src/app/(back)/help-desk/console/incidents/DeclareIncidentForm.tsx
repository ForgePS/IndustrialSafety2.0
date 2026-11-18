'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { componentStatusLabels, incidentImpactLabels } from '@/lib/forgeHelpdesk'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { createIncidentAction } from '../actions'

export const INCIDENT_COMPONENT_STATUSES = ['degraded_performance', 'partial_outage', 'major_outage', 'maintenance']

export const ComponentPicker = ({
  components,
  value,
  onChange
}: {
  components: { id: string; name: string }[]
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) => (
  <div className='grid gap-2 sm:grid-cols-2'>
    {components.map(c => (
      <div key={c.id} className='flex items-center gap-2'>
        <input
          id={`cmp-${c.id}`}
          type='checkbox'
          checked={!!value[c.id]}
          onChange={e => {
            const next = { ...value }

            if (e.target.checked) next[c.id] = 'degraded_performance'
            else delete next[c.id]
            onChange(next)
          }}
        />
        <label htmlFor={`cmp-${c.id}`} className='flex-1 text-sm'>
          {c.name}
        </label>
        {value[c.id] ? (
          <select aria-label={`${c.name} status`} value={value[c.id]} onChange={e => onChange({ ...value, [c.id]: e.target.value })} className='border-input bg-card h-[30px] rounded-md border px-1 text-xs'>
            {INCIDENT_COMPONENT_STATUSES.map(s => (
              <option key={s} value={s}>
                {componentStatusLabels[s]}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    ))}
  </div>
)

export const TenantPicker = ({ tenants, value, onChange }: { tenants: { id: string; name: string }[]; value: string[]; onChange: (next: string[]) => void }) => (
  <div className='flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2'>
    {tenants.map(t => (
      <label key={t.id} className='flex items-center gap-2 text-sm'>
        <input type='checkbox' checked={value.includes(t.id)} onChange={e => onChange(e.target.checked ? [...value, t.id] : value.filter(id => id !== t.id))} />
        {t.name}
      </label>
    ))}
  </div>
)

const DeclareIncidentForm = ({
  components,
  tenants,
  defaultOpen,
  linkTicketId
}: {
  components: { id: string; name: string }[]
  tenants: { id: string; name: string }[]
  defaultOpen: boolean
  linkTicketId: string | null
}) => {
  const router = useRouter()
  const { pending, notice, run } = useActionRunner()
  const [open, setOpen] = useState(defaultOpen)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [impact, setImpact] = useState('major')
  const [isPublic, setIsPublic] = useState(true)
  const [allTenants, setAllTenants] = useState(true)
  const [tenantIds, setTenantIds] = useState<string[]>([])
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [otherNote, setOtherNote] = useState('')

  if (!open)
    return (
      <div>
        <Button type='button' variant='destructive' onClick={() => setOpen(true)}>
          Declare platform incident
        </Button>
      </div>
    )

  return (
    <Card className='border-destructive/40'>
      <CardHeader>
        <CardTitle>Declare platform incident</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {linkTicketId ? <p className='text-textSecondary text-sm'>The ticket you came from will be linked automatically.</p> : null}
        <div className='grid gap-4 md:grid-cols-2'>
          <div className='flex flex-col gap-1'>
            <label htmlFor='inc-title' className='text-sm font-medium'>
              Title (public)
            </label>
            <Input id='inc-title' maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder='Mobile inspection submissions failing' />
          </div>
          <div className='flex flex-col gap-1'>
            <label htmlFor='inc-impact' className='text-sm font-medium'>
              Impact
            </label>
            <select id='inc-impact' value={impact} onChange={e => setImpact(e.target.value)} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
              {Object.entries(incidentImpactLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className='flex flex-col gap-1'>
          <label htmlFor='inc-message' className='text-sm font-medium'>
            Customer message
          </label>
          <Textarea id='inc-message' rows={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder='We are investigating reports of… Next update in 30 minutes.' />
        </div>
        <fieldset className='flex flex-col gap-2'>
          <legend className='text-sm font-medium'>Affected components</legend>
          <ComponentPicker components={components} value={selected} onChange={setSelected} />
          <Input aria-label='Other affected area' maxLength={300} value={otherNote} onChange={e => setOtherNote(e.target.value)} placeholder='Other affected area (optional)' />
        </fieldset>
        <div className='flex flex-wrap gap-6'>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            Show on public status page
          </label>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={allTenants} onCheckedChange={setAllTenants} />
            All tenants affected
          </label>
        </div>
        {!allTenants ? <TenantPicker tenants={tenants} value={tenantIds} onChange={setTenantIds} /> : null}
        {notice ? (
          <p role='alert' className={notice.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
            {notice.text}
          </p>
        ) : null}
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='destructive'
            disabled={pending || title.trim().length < 4 || message.trim().length < 4 || (!allTenants && !tenantIds.length)}
            onClick={() =>
              run(
                () =>
                  createIncidentAction({
                    title,
                    publicMessage: message,
                    impact,
                    isPublic,
                    allTenantsAffected: allTenants,
                    tenantIds: allTenants ? [] : tenantIds,
                    components: Object.entries(selected).map(([component_id, status]) => ({ component_id, status })),
                    otherComponentNote: otherNote,
                    linkTicketId
                  }),
                'Incident declared.',
                result => router.push(`/help-desk/console/incidents/${result.incident_id}`)
              )
            }
          >
            Declare incident
          </Button>
          <Button type='button' variant='ghost' onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default DeclareIncidentForm
