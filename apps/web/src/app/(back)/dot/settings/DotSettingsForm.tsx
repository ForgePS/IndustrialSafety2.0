'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveDotSettings } from '../actions'

type Values = {
  hiddenDocumentTypes: string[]
  dotDriversAreCompanyDrivers: boolean
  insurerName: string
  insurerEmail: string
  mvrSamplePercent: number
}

const DotSettingsForm = ({ documents, initial }: { documents: Array<{ key: string; label: string; group: string }>; initial: Values }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const groups = Array.from(new Set(documents.map(item => item.group)))

  const toggle = (key: string, shown: boolean) =>
    setValues(current => ({
      ...current,
      hiddenDocumentTypes: shown ? current.hiddenDocumentTypes.filter(item => item !== key) : [...current.hiddenDocumentTypes, key]
    }))

  return (
    <fieldset disabled={pending} className='flex flex-col gap-6'>
      <section>
        <h2 className='font-semibold'>Driver file documents</h2>
        <p className='text-textSecondary mb-3 text-sm'>Unticked documents are hidden from driver files, the dashboard and the compliance report.</p>
        <div className='grid gap-4 md:grid-cols-2'>
          {groups.map(group => (
            <div key={group}>
              <div className='mb-1 text-sm font-medium'>{group}</div>
              {documents
                .filter(item => item.group === group)
                .map(item => (
                  <label key={item.key} className='flex items-center gap-2 py-0.5 text-sm'>
                    <input
                      type='checkbox'
                      data-dot-document={item.key}
                      checked={!values.hiddenDocumentTypes.includes(item.key)}
                      onChange={event => toggle(item.key, event.target.checked)}
                    />
                    {item.label}
                  </label>
                ))}
            </div>
          ))}
        </div>
      </section>

      <section className='flex flex-col gap-2'>
        <h2 className='font-semibold'>Company drivers</h2>
        <label className='flex items-start gap-2 text-sm'>
          <input
            id='dot-company-rule'
            type='checkbox'
            className='mt-1'
            checked={values.dotDriversAreCompanyDrivers}
            onChange={event => setValues(current => ({ ...current, dotDriversAreCompanyDrivers: event.target.checked }))}
          />
          <span>Every DOT driver is also a company driver on the insurance roster. Turning this on adds today&apos;s DOT drivers to the roster.</span>
        </label>
        <div className='grid gap-4 md:grid-cols-3'>
          <div>
            <Label htmlFor='dot-sample-percent'>Annual MVR sample (%)</Label>
            <Input
              id='dot-sample-percent'
              className='mt-1'
              type='number'
              min={1}
              max={100}
              value={values.mvrSamplePercent}
              onChange={event => setValues(current => ({ ...current, mvrSamplePercent: Number(event.target.value) }))}
            />
          </div>
          <div>
            <Label htmlFor='dot-insurer-name'>Insurer</Label>
            <Input id='dot-insurer-name' className='mt-1' value={values.insurerName} onChange={event => setValues(current => ({ ...current, insurerName: event.target.value }))} />
          </div>
          <div>
            <Label htmlFor='dot-insurer-email'>Insurer email</Label>
            <Input
              id='dot-insurer-email'
              className='mt-1'
              type='email'
              value={values.insurerEmail}
              onChange={event => setValues(current => ({ ...current, insurerEmail: event.target.value }))}
            />
          </div>
        </div>
      </section>

      <div>
        <Button
          onClick={() =>
            startTransition(async () => {
              const result = await saveDotSettings(values)

              if (result.error) toast('error', result.error)
              else {
                toast('success', result.message || 'Saved.')
                router.refresh()
              }
            })
          }
        >
          {pending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </fieldset>
  )
}

export default DotSettingsForm
