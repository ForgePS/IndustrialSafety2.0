'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { saveWcSettings } from '../actions'
import { WC_WEEKDAY_LABELS } from '@/lib/forgeWorkersCompEmail'

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12

  return `${display}:00 ${suffix}`
}

const WcSettingsForm = ({
  initial,
  timeZone
}: {
  initial: { enabled: boolean; recipients: string; weekday: number; hour: number }
  timeZone: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)

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
        <CardTitle>Weekly Status Email</CardTitle>
        <CardDescription>
          A digest of every open case with that week&apos;s Thursday update. Automatic delivery starts when Forge&apos;s email service is connected; these settings are used from then on.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
        <div className='flex items-center gap-3 md:col-span-12'>
          <Switch id='wc-settings-enabled' checked={values.enabled} disabled={pending} onCheckedChange={checked => setValues(current => ({ ...current, enabled: checked }))} />
          <Label htmlFor='wc-settings-enabled'>Send the weekly status email</Label>
        </div>
        <div className='md:col-span-12'>
          <Label htmlFor='wc-settings-recipients'>Recipients</Label>
          <Textarea
            id='wc-settings-recipients'
            className='mt-2'
            rows={3}
            placeholder='risk@example.com, hr@example.com'
            value={values.recipients}
            disabled={pending}
            onChange={event => setValues(current => ({ ...current, recipients: event.target.value }))}
          />
          <p className='text-textSecondary mt-1 text-xs'>Separate addresses with commas, spaces or new lines. Up to 50.</p>
        </div>
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
