'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveFleetSettings } from '@/app/(back)/fleet/settings/actions'

type Values = { defectOutOfService: boolean; defectOpensRepair: boolean; renewalWarningDays: string; dvirRetentionDays: string }

const FleetSettingsForm = ({ initial }: { initial: Values }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  return (
    <form
      className='flex flex-col gap-6'
      noValidate
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveFleetSettings(values)

          setErrors(result.errors || {})
          if (result.errors) return void toast('error', 'Check the highlighted fields.')
          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-6'>
        <section className='flex flex-col gap-3'>
          <h2 className='font-semibold'>When a DVIR finds a defect</h2>
          <label className='flex items-start gap-2 text-sm'>
            <input
              id='fleet-defect-oos'
              type='checkbox'
              className='mt-1'
              checked={values.defectOutOfService}
              onChange={event => setValues(current => ({ ...current, defectOutOfService: event.target.checked }))}
            />
            <span>
              Take the vehicle out of service.
              <span className='text-textSecondary block text-xs'>It goes back in service when a mechanic certifies the repair.</span>
            </span>
          </label>
          <label className='flex items-start gap-2 text-sm'>
            <input
              id='fleet-defect-repair'
              type='checkbox'
              className='mt-1'
              checked={values.defectOpensRepair}
              onChange={event => setValues(current => ({ ...current, defectOpensRepair: event.target.checked }))}
            />
            <span>
              Open a repair on the Maintenance tab.
              <span className='text-textSecondary block text-xs'>The repair lists the defects and links back to the DVIR.</span>
            </span>
          </label>
        </section>

        <section className='grid gap-4 md:grid-cols-2'>
          <div>
            <Label htmlFor='fleet-warning-days'>Reminder window (days)</Label>
            <Input
              id='fleet-warning-days'
              className='mt-1'
              type='number'
              min={1}
              max={180}
              value={values.renewalWarningDays}
              onChange={event => setValues(current => ({ ...current, renewalWarningDays: event.target.value }))}
            />
            <p className='text-textSecondary mt-1 text-xs'>
              How far ahead registrations, insurance, annual inspections, vehicle documents and maintenance count as due soon. Fleet editors and maintenance staff get one
              reminder when something enters this window and another if it becomes overdue.
            </p>
            {errors.renewalWarningDays ? <p className='text-destructive mt-1 text-xs'>{errors.renewalWarningDays}</p> : null}
          </div>
          <div>
            <Label htmlFor='fleet-retention-days'>Keep closed DVIRs for (days)</Label>
            <Input
              id='fleet-retention-days'
              className='mt-1'
              type='number'
              min={91}
              max={3650}
              value={values.dvirRetentionDays}
              onChange={event => setValues(current => ({ ...current, dvirRetentionDays: event.target.value }))}
            />
            <p className='text-textSecondary mt-1 text-xs'>Federal rules require keeping DVIRs at least 3 months (91 days). DVIRs with open defects are always kept.</p>
            {errors.dvirRetentionDays ? <p className='text-destructive mt-1 text-xs'>{errors.dvirRetentionDays}</p> : null}
          </div>
        </section>

        <div>
          <Button type='submit'>{pending ? 'Saving...' : 'Save Settings'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default FleetSettingsForm
