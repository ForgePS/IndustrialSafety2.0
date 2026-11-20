'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { savePlan } from '@/app/(back)/emergency/actions'
import { DRILL_STATUSES, PLAN_STATUSES, SCENARIO_TYPES } from '@/lib/forgeEmergencyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

const humanize = (key: string) => key.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())

type Values = Record<string, string>

/** Port slice 14: create or edit an action plan, scenario procedure, drill or response team. */
const PlanForm = ({
  kind,
  initial,
  id,
  locations,
  plans,
  companyWideAllowed
}: {
  kind: string
  initial: Values
  id?: string
  locations: { id: string; name: string }[]
  plans: { id: string; title: string }[]
  companyWideAllowed: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(initial)
  const set = (key: string) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))
  const isDrill = kind === 'drill'
  const statuses = isDrill ? DRILL_STATUSES : PLAN_STATUSES

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-emergency-plan-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await savePlan({ ...values, kind, id })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/emergency/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Title
          <input name='title' required maxLength={200} value={values.title || ''} onChange={set('title')} className={field} />
        </label>
        <div className='grid gap-4 md:grid-cols-3'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Status
            <select name='status' value={values.status || statuses[0].key} onChange={set('status')} className={field}>
              {statuses.map(status => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Location
            <select name='locationId' value={values.locationId || ''} onChange={set('locationId')} className={field}>
              {companyWideAllowed ? <option value=''>Company-wide</option> : <option value=''>Pick a location</option>}
              {locations.map(location => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'scenario' || isDrill ? (
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Emergency type
              <select name='scenarioType' value={values.scenarioType || ''} onChange={set('scenarioType')} className={field}>
                <option value=''>{kind === 'scenario' ? 'Pick one' : 'Not set'}</option>
                {SCENARIO_TYPES.map(type => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {kind === 'scenario' || isDrill ? (
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Action plan
            <select name='planId' value={values.planId || ''} onChange={set('planId')} className={field}>
              <option value=''>None</option>
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isDrill ? (
          <div className='grid gap-4 md:grid-cols-3'>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Drill date
              <input type='date' name='eventDate' required value={values.eventDate || ''} onChange={set('eventDate')} className={field} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Participants
              <input type='number' name='participants' min={0} max={100000} value={values.participants || ''} onChange={set('participants')} className={field} />
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Duration (minutes)
              <input type='number' name='durationMinutes' min={0} max={1440} value={values.durationMinutes || ''} onChange={set('durationMinutes')} className={field} />
            </label>
          </div>
        ) : (
          <label className='flex max-w-xs flex-col gap-1 text-sm font-medium'>
            Next review
            <input type='date' name='reviewDueOn' value={values.reviewDueOn || ''} onChange={set('reviewDueOn')} className={field} />
          </label>
        )}
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Summary
          <textarea name='summary' rows={2} maxLength={1000} value={values.summary || ''} onChange={set('summary')} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          {isDrill ? 'Drill plan and notes' : kind === 'team' ? 'Duties and how to reach the team' : 'Procedure'}
          <textarea name='body' rows={10} maxLength={20000} value={values.body || ''} onChange={set('body')} className={field} />
        </label>
        {isDrill ? (
          <label className='flex flex-col gap-1 text-sm font-medium'>
            After-action review
            <span className='text-textSecondary text-xs font-normal'>What went well, what didn&apos;t, and what changes. Needed to mark the drill completed.</span>
            <textarea name='afterAction' rows={6} maxLength={10000} value={values.afterAction || ''} onChange={set('afterAction')} className={field} />
          </label>
        ) : null}
        <div className='flex gap-2'>
          <Button type='submit'>{pending ? 'Saving...' : 'Save'}</Button>
          <Button type='button' variant='outline' onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default PlanForm
