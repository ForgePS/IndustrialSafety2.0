'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveMoc } from '@/app/(back)/process-safety/actions'
import { CHANGE_TYPES, IMPACT_AREAS, RISK_LEVELS } from '@/lib/forgeProcessSafetyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Option = { id: string; name: string }

/** Port slice 16: raise or edit a management of change. */
const MocForm = ({
  id,
  initial,
  initialImpacts,
  initialTemporary,
  initialPssr,
  locations,
  assets,
  members
}: {
  id?: string
  initial: Record<string, string>
  initialImpacts: string[]
  initialTemporary: boolean
  initialPssr: boolean
  locations: Option[]
  assets: (Option & { locationId: string | null })[]
  members: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [impacts, setImpacts] = useState<string[]>(initialImpacts)
  const [isTemporary, setTemporary] = useState(initialTemporary)
  const [requiresPssr, setPssr] = useState(initialPssr)
  const set = (key: string) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))
  const siteAssets = assets.filter(asset => !asset.locationId || asset.locationId === values.locationId)

  const area = (key: string, label: string, rows: number, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <textarea name={key} rows={rows} value={values[key] || ''} onChange={set(key)} className={field} {...props} />
    </label>
  )

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-moc-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveMoc({ ...values, impacts, isTemporary, requiresPssr, id })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/process-safety/changes/' + result.id)
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
            Type of change
            <select name='changeType' required value={values.changeType || ''} onChange={set('changeType')} className={field}>
              <option value=''>Pick one</option>
              {CHANGE_TYPES.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Location
            <select name='locationId' required value={values.locationId || ''} onChange={set('locationId')} className={field}>
              <option value=''>Pick one</option>
              {locations.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Equipment (optional)
            <select name='assetId' value={values.assetId || ''} onChange={set('assetId')} className={field}>
              <option value=''>None</option>
              {siteAssets.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {area('description', 'What is changing', 4, { required: true, maxLength: 10000 })}
        {area('reason', 'Why it is needed', 3, { required: true, maxLength: 5000 })}
        {area('technicalBasis', 'Technical basis (optional)', 3, { maxLength: 10000 })}
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Risk level
            <select name='riskLevel' required value={values.riskLevel || ''} onChange={set('riskLevel')} className={field}>
              <option value=''>Pick one</option>
              {RISK_LEVELS.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Owner
            <select name='ownerUserId' value={values.ownerUserId || ''} onChange={set('ownerUserId')} className={field}>
              <option value=''>Me</option>
              {members.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className='flex flex-col gap-2'>
          <legend className='text-sm font-medium'>What it affects</legend>
          <div className='grid gap-1 md:grid-cols-2'>
            {IMPACT_AREAS.map(item => (
              <label key={item.key} className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  name='impacts'
                  value={item.key}
                  checked={impacts.includes(item.key)}
                  onChange={event => setImpacts(current => (event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key)))}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className='flex flex-wrap items-end gap-4'>
          <label className='flex items-center gap-2 text-sm font-medium'>
            <input type='checkbox' name='isTemporary' checked={isTemporary} onChange={event => setTemporary(event.target.checked)} />
            Temporary change
          </label>
          {isTemporary ? (
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Reverse by
              <input type='date' name='temporaryUntil' required value={values.temporaryUntil || ''} onChange={set('temporaryUntil')} className={field} />
            </label>
          ) : null}
          {values.changeType === 'organizational' ? (
            <label className='flex items-center gap-2 text-sm font-medium'>
              <input type='checkbox' name='requiresPssr' checked={requiresPssr} onChange={event => setPssr(event.target.checked)} />
              Needs a pre-startup safety review
            </label>
          ) : null}
        </div>
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

export default MocForm
