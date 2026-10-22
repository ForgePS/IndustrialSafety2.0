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
import { createAssetMaintenance, createAssetMeterReading } from './actions'
import type { AssetFormValues } from './actions'

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

const AssetServiceForm = ({
  assetId,
  form,
  mode
}: {
  assetId: string
  form: FormDefinition
  mode: 'maintenance' | 'meter'
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<AssetFormValues>(() => {
    const next: AssetFormValues = {}
    for (const field of form.fields) {
      if (field.key === 'recorded_at') {
        const now = new Date()
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
        next[field.key] = now.toISOString().slice(0, 16)
      } else {
        next[field.key] = ''
      }
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
    setValues(current => ({ ...current, [key]: value }))
  }

  const renderField = (field: Field) => {
    const value = values[field.key]

    if (field.fieldType === 'textarea') {
      return (
        <Textarea
          rows={4}
          value={String(value ?? '')}
          placeholder={field.placeholder || undefined}
          disabled={pending || field.readOnly}
          onChange={event => setValue(field.key, event.target.value)}
        />
      )
    }

    if (field.fieldType === 'select') {
      return (
        <select
          value={String(value ?? '')}
          disabled={pending || field.readOnly}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {field.lookupOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      )
    }

    const inputType =
      field.fieldType === 'date' ? 'date' :
      field.fieldType === 'datetime' ? 'datetime-local' :
      field.fieldType === 'number' || field.fieldType === 'currency' ? 'number' :
      'text'

    return (
      <Input
        type={inputType}
        step={field.fieldType === 'currency' || field.fieldType === 'number' ? '0.01' : undefined}
        value={String(value ?? '')}
        placeholder={field.placeholder || undefined}
        disabled={pending || field.readOnly}
        onChange={event => setValue(field.key, event.target.value)}
      />
    )
  }

  const save = () => {
    startTransition(async () => {
      const result = mode === 'maintenance'
        ? await createAssetMaintenance({ assetId, values })
        : await createAssetMeterReading({ assetId, values })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save record.')
        return
      }

      toast('success', 'message' in result ? String(result.message) : 'Record saved.')
      router.push('/assets/' + assetId)
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      {sections.map(([sectionKey, section]) => (
        <Card key={sectionKey}>
          <CardHeader>
            <CardTitle>{section.label}</CardTitle>
            <CardDescription>Configured through Forge Forms & Fields.</CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
            {section.fields.map(field => (
              <div key={field.id} className={widthClass[field.width] || 'md:col-span-12'}>
                <Label>
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

      <div className='flex gap-3'>
        <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : form.submitLabel}</Button>
        <Button variant='outline' asChild><Link href={'/assets/' + assetId}>Cancel</Link></Button>
      </div>
    </div>
  )
}

export default AssetServiceForm
