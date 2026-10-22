'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { toast } from '@repo/ui/utils/toast'

import { saveWcSettings } from '../actions'
import { WC_WEEKDAY_LABELS } from '@/lib/forgeWorkersCompEmail'

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const SCOPE_LABELS: Record<string, string> = {
  organization: 'All locations',
  division: 'Their divisions',
  location: 'Their locations',
  assigned: 'Assigned cases',
  own: 'Own cases'
}

const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12

  return `${display}:00 ${suffix}`
}

type Candidate = { userId: string; name: string; email: string | null; scope: string | null }

const WcSettingsForm = ({
  initial,
  timeZone,
  candidates,
  lostAccess
}: {
  initial: { enabled: boolean; recipientIds: string[]; weekday: number; hour: number }
  timeZone: string
  candidates: Candidate[]
  lostAccess: Array<{ userId: string; name: string }>
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)

  const toggle = (userId: string, checked: boolean) =>
    setValues(current => ({
      ...current,
      recipientIds: checked ? [...new Set([...current.recipientIds, userId])] : current.recipientIds.filter(id => id !== userId)
    }))

  const save = () =>
    startTransition(async () => {
      const result = await saveWcSettings(values)

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Status Notice</CardTitle>
        <CardDescription>
          A weekly summary of open cases and missing Thursday updates. It goes to the Forge users you choose, in their notifications and by email. Each person sees only the cases in their own workers&apos; comp access.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
        <div className='flex items-center gap-3 md:col-span-12'>
          <Switch id='wc-settings-enabled' checked={values.enabled} disabled={pending} onCheckedChange={checked => setValues(current => ({ ...current, enabled: checked }))} />
          <Label htmlFor='wc-settings-enabled'>Send the weekly status notice</Label>
        </div>
        <fieldset className='md:col-span-12' data-testid='wc-settings-recipients'>
          <legend className='text-sm font-medium'>Recipients</legend>
          {candidates.length ? (
            <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2'>
              {candidates.map(candidate => (
                <label key={candidate.userId} className='flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-3'>
                  <input
                    type='checkbox'
                    className='mt-1'
                    checked={values.recipientIds.includes(candidate.userId)}
                    disabled={pending}
                    onChange={event => toggle(candidate.userId, event.target.checked)}
                    aria-label={candidate.name}
                  />
                  <span className='min-w-0'>
                    <span className='block break-words font-medium'>{candidate.name}</span>
                    <span className='text-textSecondary block break-words text-xs'>
                      {candidate.email || 'No email address'} · {SCOPE_LABELS[candidate.scope || ''] || 'Scoped access'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className='text-textSecondary mt-2 text-sm'>No members have workers&apos; comp access yet.</p>
          )}
          {lostAccess.length ? (
            <div className='mt-3 rounded-md border border-warning p-3 text-sm' data-testid='wc-settings-lost-access'>
              <p className='font-medium'>No longer have workers&apos; comp access (they will not receive it):</p>
              <ul className='mt-1 flex flex-wrap gap-2'>
                {lostAccess.map(item => (
                  <li key={item.userId}>
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => toggle(item.userId, false)} hidden={!values.recipientIds.includes(item.userId)}>
                      Remove {item.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className='text-textSecondary mt-2 text-xs'>Up to 50 people. Only active members with workers&apos; comp access can be chosen.</p>
        </fieldset>
        <div className='md:col-span-6'>
          <Label htmlFor='wc-settings-weekday'>Day</Label>
          <select id='wc-settings-weekday' className={selectClass} value={values.weekday} disabled={pending} onChange={event => setValues(current => ({ ...current, weekday: Number(event.target.value) }))}>
            {WC_WEEKDAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </div>
        <div className='md:col-span-6'>
          <Label htmlFor='wc-settings-hour'>Time ({timeZone})</Label>
          <select id='wc-settings-hour' className={selectClass} value={values.hour} disabled={pending} onChange={event => setValues(current => ({ ...current, hour: Number(event.target.value) }))}>
            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
          </select>
        </div>
        <div className='md:col-span-12'>
          <Button disabled={pending} onClick={save}>{pending ? 'Saving...' : 'Save Settings'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default WcSettingsForm
