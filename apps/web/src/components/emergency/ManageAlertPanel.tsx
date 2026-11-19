'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { clearAlert, updateAlert } from '@/app/(back)/emergency/actions'
import { ALERT_SEVERITIES } from '@/lib/forgeEmergencyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** Port slice 14: send an update to an active alert, or give the all-clear. Both go to everyone it was sent to. */
const ManageAlertPanel = ({
  alert
}: {
  alert: { id: string; severity: string; headline: string; message: string; instructions: string | null; recipient_count: number; is_drill: boolean }
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'none' | 'update' | 'clear'>('none')
  const [update, setUpdate] = useState({ severity: alert.severity, headline: alert.headline, message: alert.message, instructions: alert.instructions || '' })
  const [clear, setClear] = useState({ message: 'The emergency is over. Return to normal operations unless told otherwise.', instructions: '' })
  const people = `${alert.recipient_count} ${alert.recipient_count === 1 ? 'person' : 'people'}`

  const run = (action: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Done.')
      setMode('none')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-4' data-emergency-manage>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant={mode === 'update' ? 'default' : 'outline'} onClick={() => setMode(mode === 'update' ? 'none' : 'update')}>
          Send an update
        </Button>
        <Button type='button' variant={mode === 'clear' ? 'default' : 'outline'} onClick={() => setMode(mode === 'clear' ? 'none' : 'clear')} data-emergency-clear-open>
          Give the all-clear
        </Button>
      </div>
      {mode === 'update' ? (
        <form
          className='flex flex-col gap-3'
          data-emergency-update-form
          onSubmit={event => {
            event.preventDefault()
            if (!window.confirm(`Send this update to ${people}?`)) return
            run(() => updateAlert(alert.id, update))
          }}
        >
          <fieldset disabled={pending} className='flex flex-col gap-3'>
            <label className='flex max-w-xs flex-col gap-1 text-sm font-medium'>
              Severity
              <select value={update.severity} onChange={event => setUpdate({ ...update, severity: event.target.value })} className={field}>
                {ALERT_SEVERITIES.map(severity => (
                  <option key={severity.key} value={severity.key}>
                    {severity.label}
                  </option>
                ))}
              </select>
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Headline
              <input maxLength={120} required value={update.headline} onChange={event => setUpdate({ ...update, headline: event.target.value })} className={field} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Message
              <textarea rows={3} maxLength={1000} required value={update.message} onChange={event => setUpdate({ ...update, message: event.target.value })} className={field} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Instructions
              <textarea rows={2} maxLength={2000} value={update.instructions} onChange={event => setUpdate({ ...update, instructions: event.target.value })} className={field} />
            </label>
            <div>
              <Button type='submit'>{pending ? 'Sending...' : `Send update to ${people}`}</Button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {mode === 'clear' ? (
        <form
          className='flex flex-col gap-3'
          data-emergency-clear-form
          onSubmit={event => {
            event.preventDefault()
            run(() => clearAlert(alert.id, clear))
          }}
        >
          <fieldset disabled={pending} className='flex flex-col gap-3'>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              All-clear message
              <textarea rows={3} maxLength={1000} value={clear.message} onChange={event => setClear({ ...clear, message: event.target.value })} className={field} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Instructions (optional)
              <textarea rows={2} maxLength={2000} value={clear.instructions} onChange={event => setClear({ ...clear, instructions: event.target.value })} className={field} />
            </label>
            <p className='text-textSecondary text-xs'>This ends the alert and closes responses. It can&apos;t be undone.</p>
            <div>
              <Button type='submit' data-emergency-clear-submit>
                {pending ? 'Sending...' : `Send all-clear to ${people}`}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </div>
  )
}

export default ManageAlertPanel
