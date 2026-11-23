'use client'

import { useEffect, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

type Result = { error?: string; message?: string; id?: string }
type Value = string | boolean | string[]

export type Field = {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'date' | 'datetime' | 'number' | 'checkbox' | 'checkboxes'
  options?: { value: string; label: string }[]
  required?: boolean
  maxLength?: number
  placeholder?: string
  help?: string

  /** Only shown (and sent) when another field has one of these values. */
  showIf?: { field: string; values: Value[] }
  wide?: boolean
}

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** A local date-time input value (YYYY-MM-DDTHH:mm) for an ISO time, in the browser's time zone. */
const localInput = (iso: string | null | undefined) => {
  if (!iso) return ''

  const date = new Date(iso)

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/**
 * Port slice 17: a form built from field definitions that sends its values to one server action. Date-times are
 * sent as ISO times so the server never has to guess the browser's time zone.
 */
const FieldForm = ({
  fields,
  initial,
  action,
  goTo,
  submitLabel = 'Save',
  resetOnSuccess = false,
  formKey
}: {
  fields: Field[]
  initial: Record<string, Value>
  action: (values: Record<string, unknown>) => Promise<Result>
  goTo?: string
  submitLabel?: string
  resetOnSuccess?: boolean
  formKey: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<string, Value>>(initial)
  const set = (name: string, value: Value) => setValues(current => ({ ...current, [name]: value }))

  // Stored times arrive as ISO; show them in the browser's own time zone (after mount, so hydration matches).
  useEffect(() => {
    setValues(current => {
      const next = { ...current }

      for (const item of fields) if (item.type === 'datetime' && typeof next[item.name] === 'string' && /[Z+]/.test(String(next[item.name]))) next[item.name] = localInput(String(next[item.name]))

      return next
    })
  }, [fields])

  const visible = (item: Field) => !item.showIf || item.showIf.values.some(value => value === values[item.showIf!.field])

  const render = (item: Field) => {
    const value = values[item.name]
    const common = { name: item.name, required: item.required, 'aria-label': item.label }

    if (item.type === 'checkbox') {
      return (
        <label className='flex items-center gap-2 text-sm font-medium'>
          <input type='checkbox' name={item.name} checked={value === true} onChange={event => set(item.name, event.target.checked)} />
          {item.label}
        </label>
      )
    }

    if (item.type === 'checkboxes') {
      const list = Array.isArray(value) ? value : []

      return (
        <fieldset className='flex flex-col gap-1'>
          <legend className='text-sm font-medium'>{item.label}</legend>
          <div className='grid gap-1 md:grid-cols-3'>
            {(item.options || []).map(option => (
              <label key={option.value} className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  name={item.name}
                  value={option.value}
                  checked={list.includes(option.value)}
                  onChange={event => set(item.name, event.target.checked ? [...list, option.value] : list.filter(entry => entry !== option.value))}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      )
    }

    const input =
      item.type === 'textarea' ? (
        <textarea {...common} rows={3} maxLength={item.maxLength} placeholder={item.placeholder} value={String(value ?? '')} onChange={event => set(item.name, event.target.value)} className={field} />
      ) : item.type === 'select' ? (
        <select {...common} value={String(value ?? '')} onChange={event => set(item.name, event.target.value)} className={field}>
          {(item.options || []).map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={item.type === 'datetime' ? 'datetime-local' : item.type}
          step={item.type === 'number' ? 'any' : undefined}
          maxLength={item.maxLength}
          placeholder={item.placeholder}
          value={String(value ?? '')}
          onChange={event => set(item.name, event.target.value)}
          className={field}
        />
      )

    return (
      <label className='flex flex-col gap-1 text-sm font-medium'>
        {item.label}
        {input}
        {item.help ? <span className='text-textSecondary text-xs font-normal'>{item.help}</span> : null}
      </label>
    )
  }

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-form={formKey}
      onSubmit={event => {
        event.preventDefault()

        const sent: Record<string, unknown> = {}

        for (const item of fields) {
          if (!visible(item)) continue
          const value = values[item.name]

          sent[item.name] = item.type === 'datetime' && typeof value === 'string' && value ? new Date(value).toISOString() : value
        }

        startTransition(async () => {
          const result = await action(sent)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          if (resetOnSuccess) setValues(initial)
          if (goTo) router.push(goTo.replace('{id}', result.id || ''))
          else router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='grid gap-4 md:grid-cols-2'>
        {fields.filter(visible).map(item => (
          <div key={item.name} className={item.wide || item.type === 'textarea' || item.type === 'checkboxes' ? 'md:col-span-2' : ''}>
            {render(item)}
          </div>
        ))}
        <div className='flex gap-2 md:col-span-2'>
          <Button type='submit'>{pending ? 'Saving...' : submitLabel}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default FieldForm
