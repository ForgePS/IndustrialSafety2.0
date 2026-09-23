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
import {
  assignTraining,
  createTrainingCourse,
  recordTrainingCompletion,
  updateTrainingCourse
} from './actions'
import type { TrainingFormValues } from './actions'

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

const widthClass: Record<string, string> = {
  quarter: 'md:col-span-3',
  third: 'md:col-span-4',
  half: 'md:col-span-6',
  two_thirds: 'md:col-span-8',
  three_quarters: 'md:col-span-9',
  full: 'md:col-span-12'
}

const TrainingRecordForm = ({
  form,
  mode,
  initialValues = {},
  courseId,
  courses = [],
  personnel = []
}: {
  form: FormDefinition
  mode: 'course' | 'assignment' | 'completion'
  initialValues?: TrainingFormValues
  courseId?: string
  courses?: ResourceOption[]
  personnel?: ResourceOption[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<TrainingFormValues>(() => {
    const next: TrainingFormValues = { ...initialValues }
    for (const field of form.fields) {
      if (!(field.key in next)) next[field.key] = ''
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
    const disabled = pending || field.readOnly
    const value = values[field.key]

    if (field.key === 'course_id') {
      return (
        <select
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select course...</option>
          {courses.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      )
    }

    if (field.key === 'personnel_id' || field.fieldType === 'person') {
      return (
        <select
          value={String(value ?? '')}
          disabled={disabled}
          onChange={event => setValue(field.key, event.target.value)}
          className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
        >
          <option value=''>Select personnel...</option>
          {personnel.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      )
    }

    if (field.fieldType === 'textarea') {
      return (
        <Textarea
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

    const inputType =
      field.fieldType === 'number' || field.fieldType === 'currency' ? 'number' :
      field.fieldType === 'date' ? 'date' :
      field.fieldType === 'datetime' ? 'datetime-local' :
      field.fieldType === 'time' ? 'time' :
      'text'

    return (
      <Input
        type={inputType}
        value={String(value ?? '')}
        placeholder={field.placeholder || undefined}
        disabled={disabled}
        step={field.key === 'hours' || field.key === 'score' ? '0.01' : undefined}
        onChange={event => setValue(field.key, event.target.value)}
      />
    )
  }

  const save = () => {
    startTransition(async () => {
      const result =
        mode === 'course'
          ? courseId
            ? await updateTrainingCourse({ courseId, values })
            : await createTrainingCourse(values)
          : mode === 'assignment'
            ? await assignTraining(values)
            : await recordTrainingCompletion(values)

      if ('error' in result) {
        toast('error', result.error || 'Unable to save training record.')
        return
      }

      toast('success', result.message || 'Training record saved.')

      if (mode === 'course' && !courseId && 'id' in result && result.id) {
        router.push(`/training/courses/${result.id}`)
      } else {
        router.push('/training')
      }
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      {sections.map(([sectionKey, section]) => (
        <Card key={sectionKey}>
          <CardHeader>
            <CardTitle>{section.label}</CardTitle>
            <CardDescription>Fields, labels and dropdowns are controlled by the tenant's Forge configuration.</CardDescription>
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

      <div className='flex flex-wrap gap-3'>
        <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : form.submitLabel}</Button>
        <Button variant='outline' asChild><Link href='/training'>{form.cancelLabel || 'Cancel'}</Link></Button>
      </div>
    </div>
  )
}

export default TrainingRecordForm
