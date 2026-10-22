'use client'

import { useEffect, useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TbArrowLeft, TbArrowRight, TbChevronDown, TbInfoCircle, TbSend } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { cn } from '@repo/ui/lib/utils'

import { captureTechnicalContext, priorityLabels, severityDescriptions, type TechnicalContextInput } from '@/lib/forgeHelpdesk'
import { AttachmentPicker, uploadTicketAttachment } from '@/components/helpdesk/AttachmentUploader'
import { createHelpdeskTicketAction } from '@/app/(back)/help-desk/actions'

type Option = { id: string; key: string; label: string; description?: string | null }

const STEPS = ['Request type', 'Where', 'Details', 'Review'] as const

const NewTicketForm = ({
  basePath,
  categories,
  areas,
  locations,
  captureTechnicalContext: captureEnabled,
  limits,
  assist,
  initialModuleId,
  clientErrorId
}: {
  basePath: string
  categories: Option[]
  areas: Option[]
  locations: { id: string; name: string }[]
  captureTechnicalContext: boolean
  limits: { attachmentMaxMb: number; videoMaxMb: number }
  assist: { id: string; question: string; answer: string | null; moduleId: string | null } | null
  initialModuleId: string | null
  clientErrorId: string | null
}) => {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [moduleId, setModuleId] = useState(assist?.moduleId || initialModuleId || '')
  const [locationId, setLocationId] = useState(locations.length === 1 ? locations[0].id : '')
  const [subject, setSubject] = useState(assist ? assist.question.slice(0, 160) : '')
  const [description, setDescription] = useState(assist ? assist.question : '')
  const [severity, setSeverity] = useState('p3_normal')
  const [files, setFiles] = useState<File[]>([])
  const [context, setContext] = useState<TechnicalContextInput>({})
  const [showContext, setShowContext] = useState(false)
  const [idempotencyKey] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!captureEnabled) return
    let route: string | undefined

    try {
      const referrer = document.referrer ? new URL(document.referrer) : null

      if (referrer && referrer.origin === window.location.origin) route = referrer.pathname
    } catch {
      route = undefined
    }

    setContext(captureTechnicalContext({ route, clientErrorId: clientErrorId || undefined }))
  }, [captureEnabled, clientErrorId])

  const category = categories.find(c => c.id === categoryId)
  const area = areas.find(a => a.id === moduleId)

  const contextRows = useMemo(
    () =>
      [
        ['Page', context.route],
        ['Browser', [context.browser_name, context.browser_version].filter(Boolean).join(' ')],
        ['Operating system', context.os_name],
        ['Device', context.device_type],
        ['Screen', context.viewport_width ? `${context.viewport_width} × ${context.viewport_height}` : ''],
        ['Time zone', context.client_timezone],
        ['App version', context.app_version],
        ['Error reference', context.client_error_id]
      ].filter(([, v]) => v) as [string, string][],
    [context]
  )

  const canNext = step === 0 ? Boolean(categoryId) : step === 1 ? true : step === 2 ? subject.trim().length >= 4 && description.trim().length >= 10 : true

  const submit = async () => {
    setBusy(true)
    setError('')

    const result = await createHelpdeskTicketAction({
      idempotencyKey,
      subject,
      description: assist?.answer ? `${description}\n\n— Ask Forge suggested: ${assist.answer.slice(0, 1500)}` : description,
      categoryId,
      moduleId: moduleId || null,
      severity,
      locationId: locationId || null,
      assistSessionId: assist?.id || null,
      source: context.is_mobile ? 'mobile' : 'web',
      technicalContext: captureEnabled ? context : undefined
    })

    if (!result.ok) {
      setBusy(false)
      setError(result.error || 'Unable to submit the ticket.')

      return
    }

    const ticketId = String(result.ticketId)
    const failures: string[] = []

    if (!result.duplicate) {
      for (const file of files) {
        const upload = await uploadTicketAttachment(basePath, ticketId, file)

        if (!upload.ok) failures.push(`${file.name}: ${upload.error}`)
      }
    }

    router.push(`/help-desk/tickets/${ticketId}?created=1${failures.length ? '&upload_failed=' + failures.length : ''}`)
  }

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-6'>
      <div>
        <Link href='/help-desk' className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          Help Center
        </Link>
        <h1 className='text-textPrimary mt-2 text-3xl font-bold'>Submit a ticket</h1>
        <p className='text-textSecondary mt-1'>Tell us what is happening. Forge Support will reply here and by notification.</p>
      </div>

      <ol className='grid grid-cols-4 gap-2' aria-label='Progress'>
        {STEPS.map((name, i) => (
          <li key={name} aria-current={i === step ? 'step' : undefined} className={cn('rounded-md border-t-4 pt-2 text-xs font-medium sm:text-sm', i <= step ? 'border-primary text-textPrimary' : 'text-textSecondary border-transparent bg-transparent')}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>

      {assist ? (
        <Card>
          <CardContent className='text-sm'>
            <p className='flex items-center gap-2 pt-4 font-medium'>
              <TbInfoCircle />
              Continuing from Ask Forge
            </p>
            <p className='text-textSecondary mt-1'>Your question and Forge&apos;s suggested answer will be attached so support can see what you already tried.</p>
          </CardContent>
        </Card>
      ) : null}

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What do you need help with?</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3 sm:grid-cols-2' role='radiogroup' aria-label='Request type'>
            {categories.map(c => (
              <button
                key={c.id}
                type='button'
                role='radio'
                aria-checked={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                className={cn('rounded-lg border p-4 text-left transition-colors', categoryId === c.id ? 'border-primary bg-primary/5' : 'hover:border-primary/60')}
              >
                <span className='block font-semibold'>{c.label}</span>
                {c.description ? <span className='text-textSecondary block text-sm'>{c.description}</span> : null}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Where is this happening?</CardTitle>
            <CardDescription>Optional, but it helps us route your ticket faster.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <label className='flex flex-col gap-1 text-sm'>
              Product area
              <select value={moduleId} onChange={e => setModuleId(e.target.value)} className='border-input bg-card h-[38px] rounded-md border px-3'>
                <option value=''>Not sure</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className='flex flex-col gap-1 text-sm'>
              Location
              <select value={locationId} onChange={e => setLocationId(e.target.value)} className='border-input bg-card h-[38px] rounded-md border px-3' disabled={!locations.length}>
                <option value=''>{locations.length ? 'Not location-specific' : 'No assigned Locations'}</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Describe the issue</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <label className='flex flex-col gap-1 text-sm'>
              Subject
              <Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={160} placeholder='e.g. Inspection will not submit from mobile device' required />
            </label>
            <label className='flex flex-col gap-1 text-sm'>
              What happened? What did you expect?
              <Textarea rows={6} value={description} onChange={e => setDescription(e.target.value)} maxLength={10000} placeholder='Steps you took, what you saw, and who is affected.' required />
            </label>
            <fieldset className='flex flex-col gap-2'>
              <legend className='mb-1 text-sm'>How much is this affecting your work?</legend>
              {Object.entries(severityDescriptions).map(([key, text]) => (
                <label key={key} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', severity === key ? 'border-primary bg-primary/5' : '')}>
                  <input type='radio' name='severity' value={key} checked={severity === key} onChange={() => setSeverity(key)} className='mt-1' />
                  <span>
                    <span className='font-semibold'>{priorityLabels[key]}</span>
                    <span className='text-textSecondary block'>{text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {severity === 'p1_critical' ? (
              <p className='text-destructive text-sm' role='note'>
                If anyone is in danger, stop work and follow your site&apos;s emergency procedure first.
              </p>
            ) : null}
            <div className='flex flex-col gap-1'>
              <span className='text-sm'>Screenshots, photos or files</span>
              <AttachmentPicker files={files} onChange={setFiles} disabled={busy} />
              <span className='text-textSecondary text-xs'>
                Up to {limits.attachmentMaxMb} MB per file ({limits.videoMaxMb} MB for video).
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Review and submit</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4 text-sm'>
            <dl className='grid gap-x-4 gap-y-2 sm:grid-cols-[160px_1fr]'>
              <dt className='text-textSecondary'>Request type</dt>
              <dd>{category?.label}</dd>
              <dt className='text-textSecondary'>Product area</dt>
              <dd>{area?.label || 'Not specified'}</dd>
              <dt className='text-textSecondary'>Location</dt>
              <dd>{locations.find(l => l.id === locationId)?.name || 'Not location-specific'}</dd>
              <dt className='text-textSecondary'>Impact</dt>
              <dd>{priorityLabels[severity]}</dd>
              <dt className='text-textSecondary'>Subject</dt>
              <dd className='break-words'>{subject}</dd>
              <dt className='text-textSecondary'>Attachments</dt>
              <dd>{files.length ? files.map(f => f.name).join(', ') : 'None'}</dd>
            </dl>
            {captureEnabled ? (
              <div className='rounded-lg border'>
                <button type='button' aria-expanded={showContext} onClick={() => setShowContext(v => !v)} className='flex w-full items-center justify-between p-3 text-left font-medium'>
                  Technical details we will include
                  <TbChevronDown className={cn('transition-transform', showContext && 'rotate-180')} />
                </button>
                {showContext ? (
                  <div className='border-t p-3'>
                    <p className='text-textSecondary mb-2 text-xs'>Collected automatically to help diagnose problems. We never collect passwords, cookies or page query strings.</p>
                    <dl className='grid gap-x-4 gap-y-1 sm:grid-cols-[160px_1fr]'>
                      {contextRows.map(([k, v]) => (
                        <div key={k} className='contents'>
                          <dt className='text-textSecondary'>{k}</dt>
                          <dd className='break-all'>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      ) : null}

      <div className='flex flex-wrap justify-between gap-3'>
        <Button type='button' variant='outline' disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}>
          <TbArrowLeft />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type='button' disabled={!canNext} onClick={() => setStep(s => s + 1)}>
            Next
            <TbArrowRight />
          </Button>
        ) : (
          <Button type='button' disabled={busy} onClick={submit}>
            <TbSend />
            {busy ? 'Submitting…' : 'Submit ticket'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default NewTicketForm
