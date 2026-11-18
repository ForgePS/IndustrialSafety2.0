'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import { saveTrainingNoticeSettings, type TrainingNoticeValues } from './actions'

const Check = ({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) => (
  <label htmlFor={id} className='flex items-start gap-2 text-sm'>
    <input id={id} type='checkbox' className='mt-1' checked={checked} onChange={event => onChange(event.target.checked)} />
    <span>{children}</span>
  </label>
)

const NoticeSettingsForm = ({ initial }: { initial: TrainingNoticeValues }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const set = <K extends keyof TrainingNoticeValues>(key: K, value: TrainingNoticeValues[K]) => setValues(current => ({ ...current, [key]: value }))

  return (
    <fieldset disabled={pending} className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Learner notices</CardTitle>
          <CardDescription>In-app and email, to people who have a Forge login. Each notice is sent once.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <Check id='notice-assign' checked={values.notify_on_assign} onChange={value => set('notify_on_assign', value)}>
            Tell people when training is assigned to them.
          </Check>
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span>Remind them</span>
            <Input id='notice-due-days' aria-label='Days before due' className='w-20' type='number' min={0} max={30} value={values.due_reminder_days} onChange={event => set('due_reminder_days', Number(event.target.value))} />
            <span>days before it is due (0 = no reminder).</span>
          </div>
          <Check id='notice-overdue' checked={values.overdue_notices} onChange={value => set('overdue_notices', value)}>
            Tell them once when it becomes overdue.
          </Check>
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span>Tell them</span>
            <Input id='notice-expiring-days' aria-label='Days before expiry' className='w-20' type='number' min={0} max={120} value={values.expiring_notice_days} onChange={event => set('expiring_notice_days', Number(event.target.value))} />
            <span>days before a certification expires (0 = no notice).</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automatic retraining</CardTitle>
          <CardDescription>
            Once a day, assign every group&apos;s required courses to members who are missing them, or whose certification has expired or expires within 30 days. People who already
            have it open or current are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <Check id='notice-auto-retrain' checked={values.auto_retrain} onChange={value => set('auto_retrain', value)}>
            Assign required training automatically.
          </Check>
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span>Due</span>
            <Input id='notice-retrain-days' aria-label='Retraining due in days' className='w-20' type='number' min={1} max={180} value={values.retrain_due_days} onChange={event => set('retrain_due_days', Number(event.target.value))} />
            <span>days after it is assigned.</span>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button
          onClick={() =>
            startTransition(async () => {
              const result = await saveTrainingNoticeSettings(values)

              if (result.error) toast('error', result.error)
              else {
                toast('success', result.message || 'Saved.')
                router.refresh()
              }
            })
          }
        >
          {pending ? 'Saving...' : 'Save Notice Settings'}
        </Button>
      </div>
    </fieldset>
  )
}

export default NoticeSettingsForm
