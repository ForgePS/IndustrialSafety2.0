'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { createCorrectiveAction, updateCorrectiveAction } from './actions'
import type { CorrectiveActionFormValues } from './actions'

type Field = {
  id: string
  key: string
  label: string
  helpText: string | null
  placeholder: string | null
  fieldType: string
  sectionKey: string
  sectionLabel: string
  width: string
  required: boolean
  readOnly: boolean
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

type ResourceOption = { id: string; label: string }

const widthClass: Record<string, string> = {
  quarter: 'md:col-span-3',
  third: 'md:col-span-4',
  half: 'md:col-span-6',
  two_thirds: 'md:col-span-8',
  three_quarters: 'md:col-span-9',
  full: 'md:col-span-12'
}

const CorrectiveActionRecordForm = ({
  form,
  initialValues = {},
  correctiveActionId,
  personnel,
  locations,
  divisions,
  readOnly = false,
  canAssign = true
}: {
  form: FormDefinition
  initialValues?: CorrectiveActionFormValues
  correctiveActionId?: string
  personnel: ResourceOption[]
  locations: ResourceOption[]
  divisions: ResourceOption[]
  readOnly?: boolean
  canAssign?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<CorrectiveActionFormValues>(() => {
    const next: CorrectiveActionFormValues = { ...initialValues }

    for (const field of form.fields) {
      if (!(field.key in next)) {
        next[field.key] =
          field.key === 'action_type'
            ? 'corrective'
            : field.key === 'severity'
              ? 'moderate'
              : field.key === 'source_type'
                ? 'manual'
                : field.key === 'root_cause_required'
                  ? true
                  : ''
      }
    }

    return next
  })

  const sections = useMemo(() => {
    const map = new Map<string, { label: string; fields: Field[] }>()

    for (const field of form.fields) {
      if (!map.has(field.sectionKey)) {
        map.set(field.sectionKey, { label: field.sectionLabel, fields: [] })
      }
      map.get(field.sectionKey)?.fields.push(field)
    }

    return Array.from(map.entries())
  }, [form.fields])

  const setValue = (key: string, value: string | boolean | null) => {
    setValues(current => ({ ...current, [key]: value }))
  }

  const renderField = (field: Field) => {
    const fieldId = 'capa-' + field.key
    const assignmentField = ['assigned_personnel_id','location_id','division_id'].includes(field.key)
    const disabled =
      readOnly ||
      pending ||
      field.readOnly ||
      (Boolean(correctiveActionId) && assignmentField && !canAssign)

    const value = values[field.key]

    if (field.fieldType === 'textarea') {
      return (
        <Textarea
          id={fieldId}
          name={field.key}
          rows={4}
          value={String(value ?? '')}
          placeholder={field.placeholder || undefined}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
        />
      )
    }

    if (field.fieldType === 'checkbox' || field.fieldType === 'switch') {
      return (
        <label className='flex min-h-[38px] items-center gap-3 rounded-md border px-3'>
          <input
            id={fieldId}
            name={field.key}
            type='checkbox'
            checked={Boolean(value)}
            disabled={disabled}
            onChange={event => setValue(field.key, event.target.checked)}
          />
          <span className='text-sm'>{Boolean(value) ? 'Yes' : 'No'}</span>
        </label>
      )
    }

    if (field.fieldType === 'select') {
      return (
        <select
          id={fieldId}
          name={field.key}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {field.lookupOptions.map(option => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    if (field.fieldType === 'person' || field.fieldType === 'location' || field.fieldType === 'division') {
      const options =
        field.fieldType === 'person'
          ? personnel
          : field.fieldType === 'location'
            ? locations
            : divisions

      return (
        <select
          id={fieldId}
          name={field.key}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {options.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    const type =
      field.fieldType === 'datetime'
        ? 'datetime-local'
        : field.fieldType === 'date'
          ? 'date'
          : field.fieldType === 'number'
            ? 'number'
            : 'text'

    return (
      <Input
        id={fieldId}
        name={field.key}
        type={type}
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
      const result = correctiveActionId
        ? await updateCorrectiveAction({ correctiveActionId, values })
        : await createCorrectiveAction(values)

      if ('error' in result) {
        toast('error', result.error || 'Unable to save Corrective Action.')
        return
      }

      toast(
        'success',
        'message' in result ? String(result.message) : 'Corrective Action saved.'
      )

      if (!correctiveActionId && 'id' in result && result.id) {
        router.push('/corrective-actions/' + result.id)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      {sections.map(([sectionKey, section]) => (
        <Card key={sectionKey}>
          <CardHeader>
            <CardTitle>{section.label}</CardTitle>
            <CardDescription>
              CAPA fields and dropdowns follow this tenant&apos;s Forge configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
            {section.fields.map(field => (
              <div key={field.id} className={widthClass[field.width] || 'md:col-span-12'}>
                <Label htmlFor={'capa-' + field.key}>
                  {field.label}
                  {field.required ? <span className='text-destructive'> *</span> : null}
                </Label>
                <div className='mt-2'>{renderField(field)}</div>
                {field.helpText ? (
                  <p className='text-textSecondary mt-1 text-xs'>{field.helpText}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className='flex flex-wrap gap-3'>
        {!readOnly ? (
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving...' : form.submitLabel}
          </Button>
        ) : null}
        <Button variant='outline' asChild>
          <Link href='/corrective-actions'>{form.cancelLabel || 'Back'}</Link>
        </Button>
      </div>
    </div>
  )
}

export default CorrectiveActionRecordForm
