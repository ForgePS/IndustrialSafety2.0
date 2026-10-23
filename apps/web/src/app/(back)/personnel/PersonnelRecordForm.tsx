'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArchive } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { archivePersonnel, createPersonnel, updatePersonnel } from './actions'
import type { PersonnelFormValues } from './actions'

type Field = {
  id: string
  key: string
  label: string
  helpText: string | null
  placeholder: string | null
  fieldType: string
  sectionKey: string
  sectionLabel: string
  sortOrder: number
  width: string
  required: boolean
  visible: boolean
  readOnly: boolean
  lookupKey: string | null
  lookupOptions: Array<{ key: string; label: string }>
}

type FormDefinition = {
  id: string
  key: string
  name: string
  description: string | null
  submitLabel: string
  cancelLabel: string
  fields: Field[]
}

type ResourceOption = {
  id: string
  label: string
}

type DepartmentChoice = ResourceOption & { locationId: string | null }
type PositionChoice = ResourceOption & { departmentId: string | null }

const widthClass: Record<string, string> = {
  quarter: 'md:col-span-3',
  third: 'md:col-span-4',
  half: 'md:col-span-6',
  two_thirds: 'md:col-span-8',
  three_quarters: 'md:col-span-9',
  full: 'md:col-span-12'
}

const PersonnelRecordForm = ({
  form,
  initialValues = {},
  personnelId,
  locations,
  divisions,
  departments = [],
  positions = [],
  supervisors = [],
  readOnly = false,
  canArchive = false
}: {
  form: FormDefinition
  initialValues?: PersonnelFormValues
  personnelId?: string
  locations: ResourceOption[]
  divisions: ResourceOption[]
  departments?: DepartmentChoice[]
  positions?: PositionChoice[]
  supervisors?: ResourceOption[]
  readOnly?: boolean
  canArchive?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [values, setValues] = useState<PersonnelFormValues>(() => {
    const next: PersonnelFormValues = { ...initialValues }

    for (const field of form.fields) {
      if (!(field.key in next)) next[field.key] = field.fieldType === 'checkbox' || field.fieldType === 'switch' ? false : ''
    }
    return next
  })

  const sections = useMemo(() => {
    const map = new Map<string, { label: string; fields: Field[] }>()

    for (const field of form.fields) {
      if (!map.has(field.sectionKey)) map.set(field.sectionKey, { label: field.sectionLabel, fields: [] })
      map.get(field.sectionKey)?.fields.push(field)
    }
    return Array.from(map.entries())
  }, [form.fields])

  const setValue = (key: string, value: string | boolean | null) => {
    setValues(current => {
      const next = { ...current, [key]: value }

      // Changing department clears a position that belongs to a different department.
      if (key === 'department_id' && next.position_id) {
        const position = positions.find(item => item.id === next.position_id)

        if (position?.departmentId && position.departmentId !== value) next.position_id = ''
      }

      // A DOT-regulated driver is always a company driver.
      if (key === 'is_dot_driver' && value === true) next.is_company_driver = true
      if (key === 'is_company_driver' && value === false) next.is_dot_driver = false

      return next
    })
  }

  const resourceSelect = (field: Field, options: ResourceOption[], disabled: boolean) => (
    <select
      id={field.key}
      value={String(values[field.key] ?? '')}
      disabled={disabled}
      onChange={event => setValue(field.key, event.target.value)}
      className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
    >
      <option value=''>{field.fieldType === 'person' ? 'No supervisor' : 'Select...'}</option>
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  )

  const renderField = (field: Field) => {
    const disabled = readOnly || field.readOnly || pending
    const value = values[field.key]

    if (field.fieldType === 'textarea') {
      return (
        <Textarea
          id={field.key}
          value={String(value ?? '')}
          placeholder={field.placeholder || undefined}
          disabled={disabled}
          rows={4}
          onChange={event => setValue(field.key, event.target.value)}
        />
      )
    }

    if (field.fieldType === 'select') {
      return (
        <select
          id={field.key}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {field.lookupOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      )
    }

    if (field.fieldType === 'location' || field.fieldType === 'division') {
      const options = field.fieldType === 'location' ? locations : divisions
      return (
        <select
          id={field.key}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      )
    }

    if (field.fieldType === 'department') {
      const selectedLocation = values.location_id ? String(values.location_id) : null

      const options = departments.filter(
        option => !option.locationId || !selectedLocation || option.locationId === selectedLocation || option.id === value
      )
      return resourceSelect(field, options, disabled)
    }

    if (field.fieldType === 'position') {
      const selectedDepartment = values.department_id ? String(values.department_id) : null

      const options = positions.filter(
        option => !option.departmentId || !selectedDepartment || option.departmentId === selectedDepartment || option.id === value
      )
      return resourceSelect(field, options, disabled)
    }

    if (field.fieldType === 'person') {
      return resourceSelect(field, supervisors.filter(option => option.id !== personnelId), disabled)
    }

    if (field.fieldType === 'checkbox' || field.fieldType === 'switch') {
      return (
        <div className='flex h-[38px] items-center gap-3'>
          <Switch
            id={field.key}
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={checked => setValue(field.key, checked)}
          />
          <span className='text-textSecondary text-sm'>{Boolean(value) ? 'Yes' : 'No'}</span>
        </div>
      )
    }

    const inputType =
      field.fieldType === 'email' ? 'email' :
      field.fieldType === 'phone' ? 'tel' :
      field.fieldType === 'number' || field.fieldType === 'currency' ? 'number' :
      field.fieldType === 'date' ? 'date' :
      field.fieldType === 'datetime' ? 'datetime-local' :
      field.fieldType === 'time' ? 'time' :
      'text'

    return (
      <Input
        id={field.key}
        type={inputType}
        value={String(value ?? '')}
        placeholder={field.placeholder || undefined}
        disabled={disabled}
        onChange={event => setValue(field.key, event.target.value)}
      />
    )
  }

  const save = () => {
    if (readOnly) return

    startTransition(async () => {
      const result = personnelId
        ? await updatePersonnel({ personnelId, values })
        : await createPersonnel(values)

      if ('error' in result) {
        toast('error', result.error || 'Unable to save personnel record.')
        return
      }

      toast('success', 'message' in result ? String(result.message) : 'Personnel record saved.')

      if (!personnelId && 'id' in result && result.id) {
        router.push(`/personnel/${result.id}`)
      } else {
        router.refresh()
      }
    })
  }

  const archive = () => {
    if (!personnelId || !window.confirm('Archive this personnel record?')) return

    startTransition(async () => {
      const result = await archivePersonnel(personnelId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to archive personnel record.')
        return
      }

      toast('success', 'message' in result ? String(result.message) : 'Saved.')
      router.push('/personnel')
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      {sections.map(([sectionKey, section]) => (
        <Card key={sectionKey}>
          <CardHeader>
            <CardTitle>{section.label}</CardTitle>
            <CardDescription>
              {readOnly ? 'Current personnel information.' : 'Fields and labels are controlled by your Forge form configuration.'}
            </CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
            {section.fields.map(field => (
              <div key={field.id} className={widthClass[field.width] || 'md:col-span-12'}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required ? <span className='text-destructive'> *</span> : null}
                </Label>
                <div className='mt-2'>{renderField(field)}</div>
                {field.helpText ? <p className='text-textSecondary mt-1 text-xs'>{field.helpText}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className='flex flex-wrap items-center gap-3'>
        {!readOnly ? (
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving...' : form.submitLabel}
          </Button>
        ) : null}

        <Button variant='tonalDefault' asChild>
          <Link href='/personnel'>{form.cancelLabel || 'Back'}</Link>
        </Button>

        {canArchive && personnelId ? (
          <Button variant='destructive' onClick={archive} disabled={pending} className='ms-auto'>
            <TbArchive />
            Archive Personnel
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default PersonnelRecordForm
