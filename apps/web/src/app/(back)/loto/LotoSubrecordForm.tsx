'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { addLotoEnergySource, addLotoStep, recordLotoReview } from './actions'
import type { LotoFormValues } from './actions'

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

const widthClass: Record<string, string> = {
  quarter: 'md:col-span-3',
  third: 'md:col-span-4',
  half: 'md:col-span-6',
  two_thirds: 'md:col-span-8',
  three_quarters: 'md:col-span-9',
  full: 'md:col-span-12'
}

const LotoSubrecordForm = ({
  procedureId,
  form,
  mode,
  onCancel
}: {
  procedureId: string
  form: FormDefinition
  mode: 'energy' | 'step' | 'review'
  onCancel?: () => void
}) => {
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<LotoFormValues>(() => {
    const next: LotoFormValues = {}
    for (const field of form.fields) next[field.key] = ''
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

  const render = (field: Field) => {
    const value = values[field.key]

    if (field.fieldType === 'select') {
      return (
        <select
          value={String(value ?? '')}
          disabled={pending || field.readOnly}
          onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {field.lookupOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      )
    }

    if (field.fieldType === 'textarea') {
      return (
        <Textarea
          rows={4}
          value={String(value ?? '')}
          placeholder={field.placeholder || undefined}
          disabled={pending || field.readOnly}
          onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
        />
      )
    }

    return (
      <Input
        type={field.fieldType === 'date' ? 'date' : 'text'}
        value={String(value ?? '')}
        placeholder={field.placeholder || undefined}
        disabled={pending || field.readOnly}
        onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
      />
    )
  }

  const save = () => {
    startTransition(async () => {
      const result =
        mode === 'energy'
          ? await addLotoEnergySource({ procedureId, values })
          : mode === 'step'
            ? await addLotoStep({ procedureId, values })
            : await recordLotoReview({ procedureId, values })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save LOTO record.')
        return
      }

      toast('success', 'message' in result ? String(result.message) : 'LOTO record saved.')
      window.location.reload()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{form.name}</CardTitle>
        <CardDescription>{form.description}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        {sections.map(([sectionKey, section]) => (
          <div key={sectionKey}>
            {sections.length > 1 ? <div className='mb-3 font-semibold'>{section.label}</div> : null}
            <div className='grid grid-cols-1 gap-5 md:grid-cols-12'>
              {section.fields.map(field => (
                <div key={field.id} className={widthClass[field.width] || 'md:col-span-12'}>
                  <Label>
                    {field.label}
                    {field.required ? <span className='text-destructive'> *</span> : null}
                  </Label>
                  <div className='mt-2'>{render(field)}</div>
                  {field.helpText ? <p className='text-textSecondary mt-1 text-xs'>{field.helpText}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className='flex gap-2'>
          <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : form.submitLabel}</Button>
          {onCancel ? <Button variant='outline' onClick={onCancel} disabled={pending}>Cancel</Button> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default LotoSubrecordForm
