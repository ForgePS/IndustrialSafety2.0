'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import type { AudiencePreview } from '@/app/(back)/emergency/actions'
import { previewAudience, sendAlert } from '@/app/(back)/emergency/actions'
import { ALERT_SEVERITIES, ALERT_TYPES, alertNotice } from '@/lib/forgeEmergencyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Template = { id: string; name: string; alert_type: string; severity: string; headline: string; message: string; instructions: string | null; requires_response: boolean }
type Option = { id: string; name: string }

/**
 * Port slice 14: compose and send an emergency alert. Pick a template or write one, pick who it goes to,
 * preview the audience, then confirm. People who can only run drills send drills.
 */
const ComposeAlertForm = ({
  templates,
  locations,
  departments,
  people,
  canSendLive,
  companyWideAllowed
}: {
  templates: Template[]
  locations: Option[]
  departments: Option[]
  people: Option[]
  canSendLive: boolean
  companyWideAllowed: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [templateId, setTemplateId] = useState('')
  const [message, setMessage] = useState({ alertType: 'general', severity: 'severe', headline: '', message: '', instructions: '' })
  const [isDrill, setIsDrill] = useState(!canSendLive)
  const [requiresResponse, setRequiresResponse] = useState(true)
  const [scope, setScope] = useState<'company' | 'targeted'>(companyWideAllowed ? 'company' : 'targeted')
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [personnelIds, setPersonnelIds] = useState<string[]>([])
  const [personSearch, setPersonSearch] = useState('')
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [confirming, setConfirming] = useState(false)

  const audience = scope === 'company' ? { scope } : { scope, locationIds, departmentIds, personnelIds }

  const changed = () => {
    setPreview(null)
    setConfirming(false)
  }

  const toggle = (list: string[], set: (next: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter(item => item !== id) : [...list, id])
    changed()
  }

  const notice = alertNotice({ ...message, instructions: message.instructions || null, headline: message.headline || 'Headline', message: message.message || 'Message', isDrill, requiresResponse }, 'issued')
  const personMatches = personSearch.trim() ? people.filter(person => !personnelIds.includes(person.id) && person.name.toLowerCase().includes(personSearch.trim().toLowerCase())).slice(0, 8) : []
  const names = new Map(people.map(person => [person.id, person.name]))

  const runPreview = () =>
    startTransition(async () => {
      const result = await previewAudience(audience, isDrill)

      if (result.error) return void toast('error', result.error)
      setPreview(result)
    })

  const send = () =>
    startTransition(async () => {
      const result = await sendAlert({ ...message, isDrill, requiresResponse, audience, templateId: templateId || undefined, confirmed: true })

      if (result.error) {
        setConfirming(false)

        return void toast('error', result.error)
      }

      toast('success', result.message || 'Sent.')
      router.push('/emergency/alerts/' + result.id)
    })

  return (
    <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]' data-emergency-compose>
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        {templates.length ? (
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Start from a template
            <select
              name='template'
              value={templateId}
              onChange={event => {
                const template = templates.find(item => item.id === event.target.value)

                setTemplateId(event.target.value)

                if (template) {
                  setMessage({ alertType: template.alert_type, severity: template.severity, headline: template.headline, message: template.message, instructions: template.instructions || '' })
                  setRequiresResponse(template.requires_response)
                }

                changed()
              }}
              className={field}
            >
              <option value=''>No template</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Type
            <select name='alertType' value={message.alertType} onChange={event => (setMessage({ ...message, alertType: event.target.value }), changed())} className={field}>
              {ALERT_TYPES.map(type => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Severity
            <select name='severity' value={message.severity} onChange={event => (setMessage({ ...message, severity: event.target.value }), changed())} className={field}>
              {ALERT_SEVERITIES.map(severity => (
                <option key={severity.key} value={severity.key}>
                  {severity.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Headline
          <input name='headline' maxLength={120} required value={message.headline} onChange={event => (setMessage({ ...message, headline: event.target.value }), changed())} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Message
          <textarea name='message' rows={4} maxLength={1000} required value={message.message} onChange={event => (setMessage({ ...message, message: event.target.value }), changed())} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Instructions (optional)
          <textarea name='instructions' rows={3} maxLength={2000} value={message.instructions} onChange={event => (setMessage({ ...message, instructions: event.target.value }), changed())} className={field} />
        </label>
        <div className='flex flex-wrap gap-6 text-sm'>
          <label className='flex items-center gap-2'>
            <input type='checkbox' name='isDrill' checked={isDrill} disabled={!canSendLive} onChange={event => (setIsDrill(event.target.checked), changed())} />
            This is a drill
            {!canSendLive ? <span className='text-textSecondary text-xs'>(you can send drills only)</span> : null}
          </label>
          <label className='flex items-center gap-2'>
            <input type='checkbox' name='requiresResponse' checked={requiresResponse} onChange={event => (setRequiresResponse(event.target.checked), changed())} />
            Ask people to say they&apos;re safe
          </label>
        </div>

        <div className='flex flex-col gap-3 rounded-md border p-4' data-emergency-audience>
          <span className='text-sm font-semibold'>Send to</span>
          <div className='flex flex-wrap gap-4 text-sm'>
            {companyWideAllowed ? (
              <label className='flex items-center gap-2'>
                <input type='radio' name='scope' checked={scope === 'company'} onChange={() => (setScope('company'), changed())} />
                Everyone in the company
              </label>
            ) : null}
            <label className='flex items-center gap-2'>
              <input type='radio' name='scope' checked={scope === 'targeted'} onChange={() => (setScope('targeted'), changed())} />
              {companyWideAllowed ? 'Chosen locations, departments or people' : 'Chosen locations'}
            </label>
          </div>
          {scope === 'targeted' ? (
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <span className='text-xs font-medium'>Locations</span>
                {locations.map(location => (
                  <label key={location.id} className='flex items-center gap-2 text-sm'>
                    <input type='checkbox' checked={locationIds.includes(location.id)} onChange={() => toggle(locationIds, setLocationIds, location.id)} />
                    {location.name}
                  </label>
                ))}
                {!locations.length ? <span className='text-textSecondary text-xs'>No locations to pick.</span> : null}
              </div>
              {companyWideAllowed ? (
                <div className='flex flex-col gap-1'>
                  <span className='text-xs font-medium'>Departments</span>
                  {departments.map(department => (
                    <label key={department.id} className='flex items-center gap-2 text-sm'>
                      <input type='checkbox' checked={departmentIds.includes(department.id)} onChange={() => toggle(departmentIds, setDepartmentIds, department.id)} />
                      {department.name}
                    </label>
                  ))}
                  {!departments.length ? <span className='text-textSecondary text-xs'>No departments set up.</span> : null}
                </div>
              ) : null}
              {companyWideAllowed ? (
                <div className='flex flex-col gap-1 md:col-span-2'>
                  <span className='text-xs font-medium'>People</span>
                  <div className='flex flex-wrap gap-2'>
                    {personnelIds.map(id => (
                      <button key={id} type='button' className='bg-muted rounded px-2 py-1 text-xs' onClick={() => toggle(personnelIds, setPersonnelIds, id)}>
                        {names.get(id)} ×
                      </button>
                    ))}
                  </div>
                  <div className='relative max-w-sm'>
                    <input type='search' aria-label='Add a person' placeholder='Add a person' value={personSearch} onChange={event => setPersonSearch(event.target.value)} className={field} />
                    {personMatches.length ? (
                      <ul className='bg-card absolute z-10 mt-1 w-full rounded-md border shadow'>
                        {personMatches.map(person => (
                          <li key={person.id}>
                            <button
                              type='button'
                              className='hover:bg-muted w-full px-3 py-2 text-left text-sm'
                              onClick={() => {
                                toggle(personnelIds, setPersonnelIds, person.id)
                                setPersonSearch('')
                              }}
                            >
                              {person.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div>
            <Button type='button' variant='outline' onClick={runPreview} data-emergency-preview-button>
              Check who it reaches
            </Button>
          </div>
          {preview ? (
            <div className='flex flex-col gap-2 text-sm' data-emergency-preview>
              <p>
                <strong data-emergency-preview-count>{preview.recipients}</strong> {preview.recipients === 1 ? 'person' : 'people'} will get it in Forge and by email
                {preview.sample?.length ? ': ' + preview.sample.join(', ') + ((preview.recipients || 0) > preview.sample.length ? ', ...' : '') : ''}.
              </p>
              {preview.excluded?.map(item => (
                <p key={item.reason} className='text-textSecondary' data-emergency-excluded={item.reason}>
                  {item.count} not reached: {item.label.toLowerCase()} ({item.names.join(', ')}
                  {item.count > item.names.length ? ', ...' : ''})
                </p>
              ))}
              {preview.tooMany ? <p className='text-error'>That is too many people for one alert. Narrow it down.</p> : null}
            </div>
          ) : null}
        </div>

        <div className='flex flex-wrap items-center gap-3'>
          {!confirming ? (
            <Button
              type='button'
              variant={isDrill ? 'default' : 'destructive'}
              disabled={!preview || !preview.recipients || preview.tooMany}
              onClick={() => setConfirming(true)}
              data-emergency-send
            >
              {isDrill ? 'Send drill alert' : 'Send live alert'}
            </Button>
          ) : (
            <>
              <span className='text-sm font-semibold' data-emergency-confirm-text>
                {isDrill ? 'Send this drill' : 'Send this LIVE alert'} to {preview?.recipients} {preview?.recipients === 1 ? 'person' : 'people'} now?
              </span>
              <Button type='button' variant={isDrill ? 'default' : 'destructive'} onClick={send} data-emergency-confirm>
                {pending ? 'Sending...' : 'Yes, send it'}
              </Button>
              <Button type='button' variant='outline' onClick={() => setConfirming(false)}>
                Not yet
              </Button>
            </>
          )}
          {!preview ? <span className='text-textSecondary text-xs'>Check who it reaches before sending.</span> : null}
        </div>
      </fieldset>

      <aside className='flex flex-col gap-2'>
        <span className='text-sm font-semibold'>What people will see</span>
        <div className='bg-card rounded-md border p-4 text-sm' data-emergency-notice-preview>
          <p className='font-semibold'>{notice.title}</p>
          <p className='text-textSecondary mt-2 whitespace-pre-line'>{notice.body}</p>
        </div>
      </aside>
    </div>
  )
}

export default ComposeAlertForm
