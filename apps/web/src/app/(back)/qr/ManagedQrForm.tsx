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
import { createManagedQrCode, updateManagedQrCode } from './actions'
import type { QrFormValues } from './actions'

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

type AssetOption = {
  id: string
  label: string
}

const widthClass: Record<string, string> = {
  quarter: 'md:col-span-3',
  third: 'md:col-span-4',
  half: 'md:col-span-6',
  two_thirds: 'md:col-span-8',
  three_quarters: 'md:col-span-9',
  full: 'md:col-span-12'
}

const ManagedQrForm = ({
  form,
  assets,
  qrCodeId,
  initialValues = {},
  readOnly = false
}: {
  form: FormDefinition
  assets: AssetOption[]
  qrCodeId?: string
  initialValues?: QrFormValues
  readOnly?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<QrFormValues>(() => {
    const next: QrFormValues = { ...initialValues }

    for (const field of form.fields) {
      if (!(field.key in next)) {
        next[field.key] = field.key === 'status'
          ? 'active'
          : field.key === 'default_action'
            ? 'asset_record'
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
    const disabled = readOnly || pending || field.readOnly
    const value = values[field.key]

    if (field.key === 'asset_id' || field.fieldType === 'asset') {
      return (
        <select
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select linked asset...</option>
          {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
        </select>
      )
    }

    if (field.fieldType === 'select') {
      const options = field.key === 'status'
        ? field.lookupOptions.filter(option => option.key !== 'archived')
        : field.lookupOptions

      return (
        <select
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select...</option>
          {options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      )
    }

    if (field.fieldType === 'textarea') {
      return (
        <Textarea
          rows={4}
          value={String(value ?? '')}
          placeholder={field.placeholder || undefined}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
        />
      )
    }

    const inputType = field.fieldType === 'datetime' ? 'datetime-local' : 'text'

    return (
      <Input
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
      const result = qrCodeId
        ? await updateManagedQrCode({ qrCodeId, values })
        : await createManagedQrCode(values)

      if ('error' in result) {
        toast('error', result.error || 'Unable to save managed QR code.')
        return
      }

      toast('success', result.message || 'Managed QR code saved.')

      if (!qrCodeId && 'id' in result && result.id) {
        router.push('/qr/' + result.id)
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
            <CardDescription>QR labels and available actions follow this tenant's Forge configuration.</CardDescription>
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

      <div className='flex flex-wrap gap-3'>
        {!readOnly ? <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : form.submitLabel}</Button> : null}
        <Button variant='outline' asChild><Link href='/qr'>{form.cancelLabel || 'Back'}</Link></Button>
      </div>
    </div>
  )
}

export default ManagedQrForm
