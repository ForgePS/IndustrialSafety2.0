'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { createArea, updateArea } from '@/app/(back)/waypoint/actions'

export type AreaFormValues = {
  name: string
  code: string
  locationId: string
  description: string
  hazards: string[]
  requiredPpe: string[]
  restrictedEntry: boolean
  entryRequirements: string
  nearestExit: string
  musterPoint: string
  nearestEyewash: string
  nearestExtinguisher: string
  nearestFirstAid: string
  emergencyNotes: string
}

type Option = { key: string; label: string; description?: string | null }

const selectClass = 'border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className='text-destructive mt-1 text-xs'>{message}</p> : null

const OptionPicker = ({
  name,
  options,
  selected,
  disabled,
  onChange
}: {
  name: string
  options: Option[]
  selected: string[]
  disabled: boolean
  onChange: (next: string[]) => void
}) => {
  // Keys saved earlier that the tenant has since hidden stay selected (and visible) until someone unticks them.
  const extra = selected
    .filter(key => !options.some(option => option.key === key))
    .map(key => ({ key, label: key.replaceAll('_', ' ') + ' (hidden)' }))

  return (
    <div className='mt-2 flex flex-wrap gap-2' role='group' aria-label={name}>
      {[...options, ...extra].map(option => {
        const checked = selected.includes(option.key)

        return (
          <label
            key={option.key}
            className={
              'has-[:focus-visible]:ring-primary cursor-pointer rounded-full border px-3 py-1 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 ' +
              (checked ? 'border-primary bg-primary text-white' : 'bg-card')
            }
          >
            <input
              type='checkbox'
              className='sr-only'
              name={name}
              value={option.key}
              checked={checked}
              disabled={disabled}
              onChange={() =>
                onChange(checked ? selected.filter(key => key !== option.key) : [...selected, option.key])
              }
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

const AreaForm = ({
  areaId,
  initial,
  locations,
  hazards,
  ppe
}: {
  areaId?: string
  initial: AreaFormValues
  locations: { id: string; label: string }[]
  hazards: Option[]
  ppe: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<AreaFormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof AreaFormValues>(key: K, value: AreaFormValues[K]) =>
    setValues(current => ({ ...current, [key]: value }))

  const text = (
    key: keyof AreaFormValues,
    label: string,
    { placeholder, multiline = false }: { placeholder?: string; multiline?: boolean } = {}
  ) => (
    <div>
      <Label htmlFor={'area-' + key}>{label}</Label>
      {multiline ? (
        <Textarea
          id={'area-' + key}
          rows={3}
          className='mt-2'
          value={values[key] as string}
          placeholder={placeholder}
          disabled={pending}
          onChange={event => set(key, event.target.value as never)}
        />
      ) : (
        <Input
          id={'area-' + key}
          className='mt-2'
          value={values[key] as string}
          placeholder={placeholder}
          disabled={pending}
          onChange={event => set(key, event.target.value as never)}
        />
      )}
      <FieldError message={errors[key]} />
    </div>
  )

  const save = () => {
    startTransition(async () => {
      const result = areaId ? await updateArea(areaId, values) : await createArea(values)

      if (!result.ok) {
        setErrors(result.errors || {})
        toast('error', result.error)

        return
      }

      setErrors({})
      toast('success', result.message)
      router.push('/waypoint/' + (result.id || areaId))
      router.refresh()
    })
  }

  return (
    <form
      className='flex flex-col gap-6'
      onSubmit={event => {
        event.preventDefault()
        save()
      }}
      data-testid='area-form'
    >
      <section className='grid gap-4 md:grid-cols-2'>
        {text('name', 'Area name', { placeholder: 'Paint Booth 2' })}
        {text('code', 'Code (optional)', { placeholder: 'PB-2' })}
        <div>
          <Label htmlFor='area-locationId'>Location</Label>
          <select
            id='area-locationId'
            className={selectClass + ' mt-2'}
            value={values.locationId}
            disabled={pending}
            onChange={event => set('locationId', event.target.value)}
          >
            <option value=''>Select location...</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.locationId} />
        </div>
        <div className='md:col-span-2'>
          {text('description', 'Description', { multiline: true, placeholder: 'What happens in this area.' })}
        </div>
      </section>

      <section>
        <h3 className='text-textPrimary font-semibold'>Required PPE</h3>
        <p className='text-textSecondary text-sm'>
          Shown as the first thing on the Area Card. Company administrators can change these lists in the Dropdown
          Manager (Required PPE, Area Hazards).
        </p>
        <OptionPicker
          name='requiredPpe'
          options={ppe}
          selected={values.requiredPpe}
          disabled={pending}
          onChange={next => set('requiredPpe', next)}
        />
      </section>

      <section>
        <h3 className='text-textPrimary font-semibold'>Hazards</h3>
        <OptionPicker
          name='hazards'
          options={hazards}
          selected={values.hazards}
          disabled={pending}
          onChange={next => set('hazards', next)}
        />
      </section>

      <section className='grid gap-4 md:grid-cols-2'>
        <label className='flex items-start gap-3 md:col-span-2'>
          <input
            type='checkbox'
            className='mt-1'
            checked={values.restrictedEntry}
            disabled={pending}
            onChange={event => set('restrictedEntry', event.target.checked)}
            data-testid='area-restricted'
          />
          <span>
            <span className='block font-medium'>Restricted entry</span>
            <span className='text-textSecondary block text-sm'>
              Permit-required, authorized people only, or confined space. The Area Card shows a red light.
            </span>
          </span>
        </label>
        <div className='md:col-span-2'>
          {text('entryRequirements', 'Before entering', {
            multiline: true,
            placeholder: 'Sign in with the shift lead. Hot work permit required.'
          })}
        </div>
      </section>

      <section className='grid gap-4 md:grid-cols-2'>
        <h3 className='text-textPrimary font-semibold md:col-span-2'>In an emergency</h3>
        {text('nearestExit', 'Nearest exit', { placeholder: 'East door, behind the press line' })}
        {text('musterPoint', 'Muster point', { placeholder: 'North parking lot, row A' })}
        {text('nearestEyewash', 'Eyewash / shower', { placeholder: 'Station 4, column C-12' })}
        {text('nearestExtinguisher', 'Fire extinguisher', { placeholder: 'Left of the entrance' })}
        {text('nearestFirstAid', 'First aid / AED', { placeholder: 'Break room, south wall' })}
        <div className='md:col-span-2'>
          {text('emergencyNotes', 'Emergency notes', {
            multiline: true,
            placeholder: 'Shut off the main gas valve at panel G1 on the way out.'
          })}
        </div>
      </section>

      <div className='flex flex-wrap gap-3'>
        <Button type='submit' disabled={pending}>
          {pending ? 'Saving...' : areaId ? 'Save area' : 'Create area'}
        </Button>
        <Button
          type='button'
          variant='outline'
          disabled={pending}
          onClick={() => router.push(areaId ? '/waypoint/' + areaId : '/waypoint')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default AreaForm
