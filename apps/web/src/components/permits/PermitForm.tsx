'use client'

import { useMemo, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { createPermit, updatePermit } from '@/app/(back)/permits/actions'
import type { PermitType } from '@/lib/forgePermitRules'
import {
  detailsProblem,
  ELECTRICAL_JUSTIFICATIONS,
  FALL_PROTECTION,
  HOT_WORK_TYPES,
  lowVoltageHint,
  normalizeDetails,
  permitPath,
  PERSONAL_FALL_SYSTEMS
} from '@/lib/forgePermitRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Option = { id: string; name: string }

export type PermitFormValues = {
  locationId: string
  spaceId: string
  assetId: string
  contractorCompanyId: string
  title: string
  workDescription: string
  workArea: string
  validFrom: string
  validUntil: string
  details: Record<string, any>
}

/**
 * Port slice 18: create or edit a draft permit. A draft saves even when the type-specific details are incomplete;
 * what's still missing shows as a warning, and submitting for approval enforces it.
 */
const PermitForm = ({
  type,
  permitId,
  initial,
  locations,
  spaces,
  assets,
  contractors,
  maxHours,
  zoneLabel
}: {
  type: PermitType
  permitId?: string
  initial: PermitFormValues
  locations: Option[]
  spaces: (Option & { locationId: string })[]
  assets: (Option & { locationId: string | null })[]
  contractors: Option[]
  maxHours: number
  zoneLabel: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<PermitFormValues>(initial)
  const set = (key: keyof PermitFormValues) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))
  const setDetail = (key: string, value: unknown) => setValues(current => ({ ...current, details: { ...current.details, [key]: value } }))
  const detail = (key: string) => (values.details[key] ?? '') as string

  const locationSpaces = spaces.filter(space => space.locationId === values.locationId)
  const locationAssets = assets.filter(asset => !asset.locationId || !values.locationId || asset.locationId === values.locationId)
  const missing = useMemo(() => detailsProblem(type, normalizeDetails(type, values.details)), [type, values.details])
  const voltageHint = type === 'electrical' ? lowVoltageHint(normalizeDetails(type, values.details)) : null

  const input = (key: keyof PermitFormValues, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={key} value={(values[key] as string) || ''} onChange={set(key)} className={field} {...props} />
    </label>
  )

  const detailInput = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={'details.' + key} value={detail(key)} onChange={event => setDetail(key, event.target.value)} className={field} {...props} />
    </label>
  )

  const detailText = (key: string, label: string, rows = 3) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <textarea name={'details.' + key} rows={rows} maxLength={2000} value={detail(key)} onChange={event => setDetail(key, event.target.value)} className={field} />
    </label>
  )

  const detailSelect = (key: string, label: string, options: Record<string, string>, empty = 'Pick one') => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <select name={'details.' + key} value={detail(key)} onChange={event => setDetail(key, event.target.value)} className={field}>
        <option value=''>{empty}</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )

  const detailCheck = (key: string, label: string) => (
    <label className='flex items-center gap-2 text-sm font-medium'>
      <input type='checkbox' name={'details.' + key} checked={values.details[key] === true} onChange={event => setDetail(key, event.target.checked)} />
      {label}
    </label>
  )

  const methods: string[] = Array.isArray(values.details.fall_protection) ? values.details.fall_protection : []

  return (
    <form
      className='flex max-w-3xl flex-col gap-6'
      data-permit-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = permitId ? await updatePermit(permitId, values) : await createPermit(type, values)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          if (result.warning) toast('warning', 'Still needed before you submit: ' + result.warning)
          router.push(permitPath(type, result.id))
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <legend className='mb-2 text-lg font-semibold'>The work</legend>
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Location
            <select
              name='locationId'
              required
              value={values.locationId}
              onChange={event => setValues(current => ({ ...current, locationId: event.target.value, spaceId: '' }))}
              className={field}
            >
              <option value=''>Pick one</option>
              {locations.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {type === 'confined_space' ? (
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Confined space
              <select name='spaceId' required value={values.spaceId} onChange={set('spaceId')} className={field}>
                <option value=''>{values.locationId ? (locationSpaces.length ? 'Pick one' : 'No permit-required spaces here') : 'Pick a location first'}</option>
                {locationSpaces.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className='grid gap-4 md:grid-cols-2'>
          {input('title', 'Title', { required: true, maxLength: 200 })}
          {input('workArea', 'Work area (where exactly)', { maxLength: 300 })}
        </div>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Work description
          <textarea name='workDescription' required rows={4} maxLength={5000} value={values.workDescription} onChange={set('workDescription')} className={field} />
        </label>
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Equipment (optional)
            <select name='assetId' value={values.assetId} onChange={set('assetId')} className={field}>
              <option value=''>None</option>
              {locationAssets.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Contractor company (optional)
            <select name='contractorCompanyId' value={values.contractorCompanyId} onChange={set('contractorCompanyId')} className={field}>
              <option value=''>None, our own people</option>
              {contractors.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className='grid gap-4 md:grid-cols-2'>
          {input('validFrom', `Valid from (${zoneLabel})`, { type: 'datetime-local', required: true })}
          {input('validUntil', `Valid until (${zoneLabel})`, { type: 'datetime-local', required: true })}
        </div>
        <p className='text-textSecondary text-xs'>A permit of this type can run for at most {maxHours} hours.</p>
      </fieldset>

      <fieldset disabled={pending} className='flex flex-col gap-4' data-permit-details>
        <legend className='mb-2 text-lg font-semibold'>Details for this permit</legend>
        {type === 'confined_space' ? (
          <>
            <div className='grid gap-4 md:grid-cols-2'>
              {detailInput('rescue_service', 'Rescue service', { maxLength: 300 })}
              {detailInput('communication', 'How the attendant and entrants communicate', { maxLength: 300 })}
            </div>
            {detailSelect('entry_type', 'Entry type', { horizontal: 'Horizontal', vertical: 'Vertical' }, 'Not set')}
            {detailText('extra_hazards', 'Other hazards for this entry')}
          </>
        ) : null}
        {type === 'hot_work' ? (
          <>
            <div className='grid gap-4 md:grid-cols-2'>
              {detailSelect('work_type', 'Kind of hot work', HOT_WORK_TYPES)}
              {detailInput('extinguisher', 'Fire extinguisher at the work', { maxLength: 300 })}
            </div>
            {detailCheck('gas_test_required', 'A gas test is needed before the work starts')}
            {detailCheck('designated_area', 'This is a designated hot work area')}
          </>
        ) : null}
        {type === 'heights' ? (
          <>
            {detailInput('working_height_ft', 'Working height (feet)', { type: 'number', min: 0, max: 2000, step: 0.5 })}
            <fieldset className='flex flex-col gap-2'>
              <legend className='text-sm font-medium'>Fall protection</legend>
              <div className='grid gap-2 md:grid-cols-2'>
                {Object.entries(FALL_PROTECTION).map(([value, label]) => (
                  <label key={value} className='flex items-center gap-2 text-sm'>
                    <input
                      type='checkbox'
                      name='details.fall_protection'
                      value={value}
                      checked={methods.includes(value)}
                      onChange={event => setDetail('fall_protection', event.target.checked ? [...methods, value] : methods.filter(item => item !== value))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {detailInput('anchorage', methods.some(item => PERSONAL_FALL_SYSTEMS.includes(item)) ? 'Anchorage (needed for personal fall protection)' : 'Anchorage', { maxLength: 500 })}
            {detailText('rescue_plan', 'Rescue plan for a fallen worker')}
            {detailInput('equipment', 'Equipment (harness, lanyard, lift, scaffold)', { maxLength: 500 })}
          </>
        ) : null}
        {type === 'electrical' ? (
          <>
            <div className='grid gap-4 md:grid-cols-2'>
              {detailInput('voltage', 'Voltage of the exposed parts (V)', { type: 'number', min: 0, step: 1 })}
              {detailInput('equipment', 'Equipment being worked on', { maxLength: 300 })}
            </div>
            {voltageHint ? (
              <p className='text-warning text-sm' data-low-voltage-hint>
                {voltageHint}
              </p>
            ) : null}
            {detailSelect('justification', 'Why the work must be done energized', ELECTRICAL_JUSTIFICATIONS)}
            {detailText('justification_detail', 'Explain why the equipment cannot be de-energized')}
            <div className='grid gap-4 md:grid-cols-3'>
              {detailInput('limited_approach', 'Limited approach boundary', { maxLength: 100 })}
              {detailInput('restricted_approach', 'Restricted approach boundary', { maxLength: 100 })}
              {detailInput('arc_flash_boundary', 'Arc flash boundary', { maxLength: 100 })}
            </div>
            <div className='grid gap-4 md:grid-cols-2'>
              {detailInput('incident_energy', 'Incident energy (cal/cm²)', { type: 'number', min: 0, step: 0.1 })}
              {detailSelect('ppe_category', 'Or PPE category', { '1': 'Category 1', '2': 'Category 2', '3': 'Category 3', '4': 'Category 4' }, 'Not set')}
            </div>
            {detailText('ppe', 'PPE required', 2)}
            {detailText('loto_considered', 'Lockout considered (what and why it is not used)', 2)}
          </>
        ) : null}
        {missing ? (
          <p className='text-warning text-sm' data-details-warning>
            Still needed before you submit: {missing}
          </p>
        ) : null}
      </fieldset>

      <div className='flex gap-2'>
        <Button type='submit' disabled={pending}>
          {pending ? 'Saving...' : 'Save draft'}
        </Button>
        <Button type='button' variant='outline' onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default PermitForm
