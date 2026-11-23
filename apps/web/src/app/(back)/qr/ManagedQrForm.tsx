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
import QrScanSettingsFields from '@/components/qr/QrScanSettingsFields'
import type { QrOption } from '@/components/qr/QrScanSettingsFields'
import { QR_TARGET_TYPE_LABELS, allowedQrDefaultActions } from '@/lib/forgeQrDestination'
import { SCAN_TARGET_TYPES, parseQrActionConfig } from '@/lib/forgeScanRules'
import type { QrActionConfig, ScanAccessMode, ScanTargetType } from '@/lib/forgeScanRules'

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

export type QrInitialSettings = {
  targetType: ScanTargetType
  targetId: string
  accessMode: ScanAccessMode
  actionConfig: unknown
}

const widthClass: Record<string, string> = {
  quarter: 'md:col-span-3',
  third: 'md:col-span-4',
  half: 'md:col-span-6',
  two_thirds: 'md:col-span-8',
  three_quarters: 'md:col-span-9',
  full: 'md:col-span-12'
}

const selectClass = 'border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const ManagedQrForm = ({
  form,
  assets,
  locations = [],
  vehicles = [],
  areas = [],
  forms = [],
  inspectionTemplates = [],
  initialSettings,
  qrCodeId,
  initialValues = {},
  readOnly = false
}: {
  form: FormDefinition
  assets: AssetOption[]
  locations?: QrOption[]

  /** Fleet vehicles in scope (not removed). */
  vehicles?: QrOption[]

  /** Waypoint areas in scope (not archived): targets for Area Card QRs. */
  areas?: QrOption[]

  /** Published forms: targets for form QRs and the linked-forms list. */
  forms?: QrOption[]
  inspectionTemplates?: QrOption[]
  initialSettings?: QrInitialSettings
  qrCodeId?: string
  initialValues?: QrFormValues
  readOnly?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [targetType, setTargetType] = useState<ScanTargetType>(initialSettings?.targetType || 'asset')

  const [targetIds, setTargetIds] = useState<Record<string, string>>(() => ({
    asset: String(initialValues.asset_id ?? ''),
    location: initialSettings?.targetType === 'location' ? initialSettings.targetId : '',
    vehicle: initialSettings?.targetType === 'vehicle' ? initialSettings.targetId : '',
    area: initialSettings?.targetType === 'area' ? initialSettings.targetId : '',
    form: initialSettings?.targetType === 'form' ? initialSettings.targetId : ''
  }))

  const [accessMode, setAccessMode] = useState<ScanAccessMode>(initialSettings?.accessMode || 'signed_in')
  const [config, setConfig] = useState<QrActionConfig>(() => parseQrActionConfig(initialSettings?.actionConfig ?? {}))

  const [values, setValues] = useState<QrFormValues>(() => {
    const next: QrFormValues = { ...initialValues }

    for (const field of form.fields) {
      if (!(field.key in next)) {
        next[field.key] = field.key === 'status'
          ? 'active'
          : field.key === 'default_action'
            ? 'scan_menu'
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

  const changeTargetType = (next: ScanTargetType) => {
    setTargetType(next)

    // Location, form and vehicle QRs can only open the scan menu.
    if (next !== 'asset') setValue('default_action', 'scan_menu')
  }

  const renderField = (field: Field) => {
    const disabled = readOnly || pending || field.readOnly
    const value = values[field.key]

    if (field.key === 'asset_id' || field.fieldType === 'asset') {
      const options =
        targetType === 'asset' ? assets : targetType === 'location' ? locations : targetType === 'vehicle' ? vehicles : targetType === 'area' ? areas : forms

      const placeholder =
        targetType === 'asset'
          ? 'Select linked asset...'
          : targetType === 'location'
            ? 'Select location...'
            : targetType === 'vehicle'
              ? 'Select vehicle...'
              : targetType === 'area'
                ? 'Select area...'
                : 'Select published form...'

      return (
        <div className='flex flex-col gap-2 sm:flex-row'>
          <select
            aria-label='QR points to'
            value={targetType}
            disabled={disabled}
            onChange={event => changeTargetType(event.target.value as ScanTargetType)}
            className={selectClass + ' sm:w-48'}
          >
            {SCAN_TARGET_TYPES.map(type => <option key={type} value={type}>{QR_TARGET_TYPE_LABELS[type]}</option>)}
          </select>
          <select
            aria-label='QR target'
            value={targetIds[targetType] || ''}
            disabled={disabled}
            onChange={event => {
              const next = event.target.value

              setTargetIds(current => ({ ...current, [targetType]: next }))
              if (targetType === 'asset') setValue(field.key, next)
            }}
            className={selectClass}
          >
            <option value=''>{placeholder}</option>
            {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      )
    }

    if (field.fieldType === 'select') {
      const allowedActions = allowedQrDefaultActions(targetType)

      const options = field.key === 'status'
        ? field.lookupOptions.filter(option => option.key !== 'archived')
        : field.key === 'default_action'
          ? field.lookupOptions.filter(option => allowedActions.includes(option.key))
          : field.lookupOptions

      return (
        <select
          aria-label={field.label}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className={selectClass}
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
          aria-label={field.label}
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
        aria-label={field.label}
        value={String(value ?? '')}
        placeholder={field.placeholder || undefined}
        disabled={disabled}
        onChange={event => setValue(field.key, event.target.value)}
      />
    )
  }

  const save = () => {
    if (readOnly) return

    const settings = {
      targetType,
      targetId: targetIds[targetType] || '',
      accessMode,
      actionConfig: config
    }

    const payload: QrFormValues = { ...values, asset_id: targetType === 'asset' ? targetIds.asset || '' : null }

    startTransition(async () => {
      const result = qrCodeId
        ? await updateManagedQrCode({ qrCodeId, values: payload, settings })
        : await createManagedQrCode(payload, settings)

      if ('error' in result) {
        toast('error', result.error || 'Unable to save managed QR code.')

        return
      }

      toast('success', 'message' in result ? String(result.message) : 'Managed QR code saved.')

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
            <CardDescription>QR labels and available actions follow this tenant&apos;s Forge configuration.</CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
            {section.fields.map(field => (
              <div key={field.id} className={widthClass[field.width] || 'md:col-span-12'}>
                <Label>
                  {field.key === 'asset_id' ? 'Points to' : field.label}
                  {field.required ? <span className='text-destructive'> *</span> : null}
                </Label>
                <div className='mt-2'>{renderField(field)}</div>
                {field.key === 'asset_id' ? (
                  <p className='text-textSecondary mt-1 text-xs'>
                    An asset, a fleet vehicle, a location, a Waypoint area or a published form. Vehicle, location, area and form QR codes open the scan menu.
                  </p>
                ) : field.helpText ? <p className='text-textSecondary mt-1 text-xs'>{field.helpText}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <QrScanSettingsFields
        targetType={targetType}
        accessMode={accessMode}
        config={config}
        inspectionTemplates={inspectionTemplates}
        forms={forms}
        disabled={readOnly || pending}
        onAccessModeChange={setAccessMode}
        onConfigChange={setConfig}
      />

      <div className='flex flex-wrap gap-3'>
        {!readOnly ? <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : form.submitLabel}</Button> : null}
        <Button variant='outline' asChild><Link href='/qr'>{form.cancelLabel || 'Back'}</Link></Button>
      </div>
    </div>
  )
}

export default ManagedQrForm
