'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { deleteSchedule, saveSchedule } from '@/app/(back)/reporting/actions'
import { SCHEDULE_FREQUENCIES, WEEKDAYS } from '@/lib/forgeReportRules'

const field = 'bg-background rounded-md border px-2 py-1 text-sm'

const COMMON_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC']

type Initial = {
  frequency: string
  hour: number
  weekday: number
  monthday: number
  timezone: string
  enabled: boolean
  recipients: string[]
}

/**
 * Port slice 13: send a saved report on a schedule. Recipients are people in the company; each one gets a notice
 * and an email linking to the report, and sees it with their own permissions. Sending to anyone but yourself
 * needs the report shared.
 */
const ScheduleForm = ({
  savedReportId,
  initial,
  exists,
  members,
  ownerId,
  shared
}: {
  savedReportId: string
  initial: Initial
  exists: boolean
  members: { id: string; name: string }[]
  ownerId: string
  shared: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [values, setValues] = useState(() => ({
    ...initial,
    timezone: initial.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'
  }))

  const zones = COMMON_ZONES.includes(values.timezone) ? COMMON_ZONES : [values.timezone, ...COMMON_ZONES]
  const set = (patch: Partial<Initial>) => setValues(current => ({ ...current, ...patch }))

  const toggleRecipient = (id: string, on: boolean) =>
    set({ recipients: on ? [...new Set([...values.recipients, id])] : values.recipients.filter(recipient => recipient !== id) })

  return (
    <form
      className='flex flex-col gap-4'
      data-report-schedule-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveSchedule({ savedReportId, ...values })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-end gap-3'>
          <label className='flex flex-col gap-1 text-xs'>
            How often
            <select name='frequency' value={values.frequency} onChange={event => set({ frequency: event.target.value })} className={field}>
              {SCHEDULE_FREQUENCIES.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {values.frequency === 'weekly' ? (
            <label className='flex flex-col gap-1 text-xs'>
              Day
              <select name='weekday' value={values.weekday} onChange={event => set({ weekday: Number(event.target.value) })} className={field}>
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {values.frequency === 'monthly' ? (
            <label className='flex flex-col gap-1 text-xs'>
              Day of the month
              <select name='monthday' value={values.monthday} onChange={event => set({ monthday: Number(event.target.value) })} className={field}>
                {Array.from({ length: 28 }, (_, index) => index + 1).map(day => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className='flex flex-col gap-1 text-xs'>
            Time
            <select name='hour' value={values.hour} onChange={event => set({ hour: Number(event.target.value) })} className={field}>
              {Array.from({ length: 24 }, (_, hour) => hour).map(hour => (
                <option key={hour} value={hour}>
                  {(hour % 12 === 0 ? 12 : hour % 12) + ':00 ' + (hour < 12 ? 'AM' : 'PM')}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-xs'>
            Time zone
            <select name='timezone' value={values.timezone} onChange={event => set({ timezone: event.target.value })} className={field}>
              {zones.map(zone => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className='flex flex-col gap-2'>
          <Label>Send to</Label>
          {!shared ? <p className='text-textSecondary text-xs'>This report is private, so it can only be sent to you. Share it to send it to other people.</p> : null}
          <div className='flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border p-3' data-report-recipients>
            {members
              .filter(member => shared || member.id === ownerId)
              .map(member => (
                <label key={member.id} className='flex items-center gap-2 text-sm'>
                  <input type='checkbox' checked={values.recipients.includes(member.id)} onChange={event => toggleRecipient(member.id, event.target.checked)} />
                  {member.name}
                  {member.id === ownerId ? <span className='text-textSecondary text-xs'>(you)</span> : null}
                </label>
              ))}
          </div>
          <p className='text-textSecondary text-xs'>
            Each person gets a notice and an email with a link. They see the report with their own permissions; anyone who can&apos;t run it is skipped.
          </p>
        </div>

        <label className='flex items-center gap-2 text-sm'>
          <input type='checkbox' checked={values.enabled} onChange={event => set({ enabled: event.target.checked })} />
          Schedule is on
        </label>

        <div className='flex gap-2'>
          <Button type='submit'>{pending ? 'Saving...' : exists ? 'Save schedule' : 'Create schedule'}</Button>
          {exists ? (
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteSchedule(savedReportId)

                  if (result.error) return void toast('error', result.error)
                  toast('success', result.message || 'Removed.')
                  router.refresh()
                })
              }
            >
              Remove schedule
            </Button>
          ) : null}
        </div>
      </fieldset>
    </form>
  )
}

export default ScheduleForm
