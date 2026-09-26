'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { createJsaAction, updateJsaAction } from './actions'
import type { JsaFormValues } from './actions'

const CONFLICT_MESSAGE =
  'This record changed after you opened it. Refresh the record before saving your changes.'

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

const JsaRecordForm = ({
  form,
  initialValues = {},
  jsaId,
  personnel,
  locations,
  divisions,
  readOnly = false,
  canAssign = true
}: {
  form: FormDefinition
  initialValues?: JsaFormValues
  jsaId?: string
  personnel: ResourceOption[]
  locations: ResourceOption[]
  divisions: ResourceOption[]
  readOnly?: boolean
  canAssign?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<JsaFormValues>(() => {
    const next: JsaFormValues = { ...initialValues }

    for (const field of form.fields) {
      if (!(field.key in next)) {
        next[field.key] = field.key === 'status' ? 'draft' : ''
      }
    }

    return next
  })

  const currentRowVersionRef = useRef(Number(initialValues.row_version || 1))
  const [currentRowVersion, setCurrentRowVersion] = useState(() => currentRowVersionRef.current)

  useEffect(() => {
    const incomingVersion = Number(initialValues.row_version || 0)
    if (!Number.isFinite(incomingVersion) || incomingVersion < 1) return
    if (incomingVersion > currentRowVersionRef.current) {
      currentRowVersionRef.current = incomingVersion
      setCurrentRowVersion(incomingVersion)
    }
  }, [initialValues.row_version])

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
    const fieldId = 'jsa-' + field.key
    const assignmentField = ['prepared_by_personnel_id', 'location_id', 'division_id'].includes(
      field.key
    )
    const disabled =
      readOnly ||
      pending ||
      field.readOnly ||
      (Boolean(jsaId) && assignmentField && !canAssign)

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
      const result = jsaId
        ? await updateJsaAction({
            jsaId,
            values,
            expectedRowVersion: currentRowVersionRef.current
          })
        : await createJsaAction(values)

      if (!result.ok && 'error' in result) {
        if (result.conflict) {
          toast('error', CONFLICT_MESSAGE)
          router.refresh()
          return
        }
        toast('error', result.error || 'Unable to save JSA.')
        return
      }

      if (result.ok && typeof result.rowVersion === 'number') {
        currentRowVersionRef.current = result.rowVersion
        setCurrentRowVersion(result.rowVersion)
      }

      toast('success', result.ok ? result.message : 'JSA saved.')

      if (!jsaId && result.ok && result.id) {
        router.push('/jsas/' + result.id)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className='flex flex-col gap-6' data-jsa-row-version={currentRowVersion}>
      {sections.map(([sectionKey, section]) => (
        <Card key={sectionKey}>
          <CardHeader>
            <CardTitle>{section.label}</CardTitle>
            <CardDescription>
              JSA fields follow this tenant&apos;s Forge configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
            {section.fields.map(field => (
              <div key={field.id} className={widthClass[field.width] || 'md:col-span-12'}>
                <Label htmlFor={'jsa-' + field.key}>
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
          <Button onClick={save} disabled={pending} data-testid='jsa-save'>
            {pending ? 'Saving...' : form.submitLabel}
          </Button>
        ) : null}
        <Button variant='outline' asChild>
          <Link href='/jsas'>{form.cancelLabel || 'Back'}</Link>
        </Button>
      </div>
    </div>
  )
}

export default JsaRecordForm
