'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { deleteTemplate, saveTemplate } from '@/app/(back)/emergency/actions'
import { ALERT_SEVERITIES, ALERT_TYPES } from '@/lib/forgeEmergencyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Template = {
  id?: string
  name: string
  alert_type: string
  severity: string
  headline: string
  message: string
  instructions: string | null
  requires_response: boolean
  enabled: boolean
}

/** Port slice 14: create or edit an alert template. */
const TemplateForm = ({ template }: { template?: Template }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(!template)

  const [values, setValues] = useState({
    name: template?.name || '',
    alertType: template?.alert_type || 'general',
    severity: template?.severity || 'severe',
    headline: template?.headline || '',
    message: template?.message || '',
    instructions: template?.instructions || '',
    requiresResponse: template ? template.requires_response : true,
    enabled: template ? template.enabled : true
  })

  if (!open) {
    return (
      <Button type='button' variant='outline' size='sm' onClick={() => setOpen(true)}>
        Edit
      </Button>
    )
  }

  return (
    <form
      className='flex flex-col gap-3'
      data-emergency-template-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveTemplate({ ...values, id: template?.id })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          if (template) setOpen(false)
          else setValues({ ...values, name: '', headline: '', message: '', instructions: '' })
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='grid gap-3 md:grid-cols-3'>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Template name
          <input name='name' required maxLength={120} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Type
          <select value={values.alertType} onChange={event => setValues({ ...values, alertType: event.target.value })} className={field}>
            {ALERT_TYPES.map(type => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Severity
          <select value={values.severity} onChange={event => setValues({ ...values, severity: event.target.value })} className={field}>
            {ALERT_SEVERITIES.map(severity => (
              <option key={severity.key} value={severity.key}>
                {severity.label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium md:col-span-3'>
          Headline
          <input name='headline' required maxLength={120} value={values.headline} onChange={event => setValues({ ...values, headline: event.target.value })} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium md:col-span-3'>
          Message
          <textarea name='message' rows={3} required maxLength={1000} value={values.message} onChange={event => setValues({ ...values, message: event.target.value })} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium md:col-span-3'>
          Instructions
          <textarea rows={2} maxLength={2000} value={values.instructions} onChange={event => setValues({ ...values, instructions: event.target.value })} className={field} />
        </label>
        <div className='flex flex-wrap items-center gap-4 text-sm md:col-span-3'>
          <label className='flex items-center gap-2'>
            <input type='checkbox' checked={values.requiresResponse} onChange={event => setValues({ ...values, requiresResponse: event.target.checked })} />
            Ask people to say they&apos;re safe
          </label>
          <label className='flex items-center gap-2'>
            <input type='checkbox' checked={values.enabled} onChange={event => setValues({ ...values, enabled: event.target.checked })} />
            Offer this template when sending
          </label>
        </div>
        <div className='flex gap-2 md:col-span-3'>
          <Button type='submit'>{pending ? 'Saving...' : template ? 'Save template' : 'Add template'}</Button>
          {template ? (
            <>
              <Button type='button' variant='outline' onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  if (!window.confirm(`Delete the "${template.name}" template?`)) return
                  startTransition(async () => {
                    const result = await deleteTemplate(template.id!)

                    if (result.error) return void toast('error', result.error)
                    toast('success', result.message || 'Deleted.')
                    router.refresh()
                  })
                }}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </fieldset>
    </form>
  )
}

export default TemplateForm
