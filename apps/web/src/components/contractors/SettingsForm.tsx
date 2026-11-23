'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveSettings } from '@/app/(back)/contractors/actions'
import type { ContractorSettings } from '@/lib/forgeContractorRules'
import { DOCUMENT_TYPES } from '@/lib/forgeContractorRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** Port slice 15: which documents a company needs, how long orientation lasts, and how early to warn. */
const SettingsForm = ({ initial }: { initial: ContractorSettings }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [required, setRequired] = useState<string[]>(initial.requiredDocuments)
  const [months, setMonths] = useState(String(initial.orientationValidMonths))
  const [days, setDays] = useState(String(initial.warningDays))

  return (
    <form
      className='flex max-w-2xl flex-col gap-4'
      data-contractor-settings-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveSettings({ requiredDocuments: required, orientationValidMonths: months, warningDays: days })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <fieldset className='flex flex-col gap-2'>
          <legend className='text-sm font-medium'>Documents every company needs on file</legend>
          {DOCUMENT_TYPES.filter(item => item.key !== 'other').map(item => (
            <label key={item.key} className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                name='requiredDocuments'
                value={item.key}
                checked={required.includes(item.key)}
                onChange={event => setRequired(current => (event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key)))}
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Orientation is good for (months)
            <input type='number' name='orientationValidMonths' min={1} max={60} required value={months} onChange={event => setMonths(event.target.value)} className={field} />
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Warn this many days before expiry
            <input type='number' name='warningDays' min={1} max={180} required value={days} onChange={event => setDays(event.target.value)} className={field} />
          </label>
        </div>
        <div>
          <Button type='submit'>{pending ? 'Saving...' : 'Save settings'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default SettingsForm
