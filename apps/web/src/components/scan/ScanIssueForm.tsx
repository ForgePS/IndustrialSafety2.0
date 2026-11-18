'use client'

import { useRef, useState } from 'react'

import Link from 'next/link'
import { TbAlertTriangle, TbCamera, TbCircleCheck, TbX } from 'react-icons/tb'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { submitIssueReport } from '@/app/scan/[token]/report/actions'
import type { IssueReportResult } from '@/app/scan/[token]/report/actions'
import {
  ISSUE_CATEGORIES,
  ISSUE_DESCRIPTION_MAX,
  ISSUE_PHOTO_MAX,
  ISSUE_PHOTO_MAX_BYTES,
  ISSUE_PHOTO_TYPES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_REPORT_PRIORITIES,
  ISSUE_TITLE_MAX,
  defaultIssueTitle
} from '@/lib/forgeScanIssues'
import type { IssueReportPriority } from '@/lib/forgeScanIssues'

type Photo = { key: string; name: string; status: 'uploading' | 'ready' | 'failed'; id?: string; error?: string; preview: string }

const selectClass = 'border-input bg-card text-textPrimary h-11 w-full rounded-md border px-3'

/**
 * Port slice 10: the scan issue report form and its confirmation (1.0 scan-public-workspace "Report issue").
 * Photos upload one by one to /scan/<token>/report/photos; the form sends only the returned upload ids.
 */
const ScanIssueForm = ({
  token,
  targetName,
  isAsset,
  noun = 'equipment',
  anonymous,
  canMarkOutOfService,
  menuHref
}: {
  token: string
  targetName: string
  isAsset: boolean

  /** What the out-of-service texts call the target. */
  noun?: 'equipment' | 'vehicle'
  anonymous: boolean
  canMarkOutOfService: boolean
  menuHref: string
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<IssueReportPriority>('medium')
  const [category, setCategory] = useState('')
  const [immediateHazard, setImmediateHazard] = useState(false)
  const [outOfService, setOutOfService] = useState(false)
  const [reporterName, setReporterName] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Extract<IssueReportResult, { ok: true }> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const showOutOfService = isAsset && canMarkOutOfService
  const outOfServiceChecked = showOutOfService && (outOfService || immediateHazard)

  const uploadPhoto = async (file: File) => {
    const key = Math.random().toString(36).slice(2)
    const preview = URL.createObjectURL(file)

    if (!(ISSUE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setPhotos(list => [...list, { key, name: file.name, status: 'failed', error: 'Use a JPG, PNG or WebP photo.', preview }])

      return
    }

    if (file.size > ISSUE_PHOTO_MAX_BYTES) {
      setPhotos(list => [...list, { key, name: file.name, status: 'failed', error: 'Photo is over 5 MB.', preview }])

      return
    }

    setPhotos(list => [...list, { key, name: file.name, status: 'uploading', preview }])

    try {
      const body = new FormData()

      body.append('file', file)

      const response = await fetch(`/scan/${encodeURIComponent(token)}/report/photos`, { method: 'POST', body })
      const result = await response.json().catch(() => ({}))

      setPhotos(list =>
        list.map(photo =>
          photo.key !== key
            ? photo
            : response.ok && result.id
              ? { ...photo, status: 'ready', id: result.id }
              : { ...photo, status: 'failed', error: result.error || 'Upload failed.' }
        )
      )
    } catch {
      setPhotos(list => list.map(photo => (photo.key === key ? { ...photo, status: 'failed', error: 'Upload failed. Check your connection.' } : photo)))
    }
  }

  const onFiles = (files: FileList | null) => {
    const room = ISSUE_PHOTO_MAX - photos.length

    for (const file of Array.from(files || []).slice(0, Math.max(0, room))) void uploadPhoto(file)
    if (fileInput.current) fileInput.current.value = ''
  }

  const removePhoto = (key: string) => setPhotos(list => list.filter(photo => photo.key !== key))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return

    if (!description.trim()) {
      setFieldErrors({ description: 'Describe the issue.' })
      setError('Check the highlighted fields.')

      return
    }

    if (photos.some(photo => photo.status === 'uploading')) {
      setError('Wait for the photos to finish uploading.')

      return
    }

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      const result = await submitIssueReport(token, {
        title,
        description,
        priority,
        category,
        immediateHazard,
        outOfService: outOfServiceChecked,
        reporterName: anonymous ? reporterName : '',
        uploadIds: photos.filter(photo => photo.status === 'ready' && photo.id).map(photo => photo.id)
      })

      if (result.ok) {
        setDone(result)
        window.scrollTo({ top: 0 })
      } else {
        setError(result.error)
        setFieldErrors(result.errors || {})
      }
    } catch {
      setError('Unable to send the report. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className='flex flex-col gap-4' data-testid='scan-issue-done'>
        <div className='rounded-lg border border-green-600/40 bg-green-600/10 p-4' role='status'>
          <p className='flex items-center gap-2 text-lg font-bold'>
            <TbCircleCheck className='text-green-600' /> Thank you. Your report was sent.
          </p>
          {done.actionNumber ? (
            <p className='mt-2'>
              Corrective Action{' '}
              {done.correctiveActionId ? (
                <Link href={`/corrective-actions/${done.correctiveActionId}`} className='text-primary font-bold underline' data-testid='scan-issue-capa'>
                  {done.actionNumber}
                </Link>
              ) : (
                <strong data-testid='scan-issue-capa'>{done.actionNumber}</strong>
              )}{' '}
              was opened. The safety team has been told.
            </p>
          ) : (
            <p className='mt-2'>The safety team has been told.</p>
          )}
        </div>

        {done.outOfService ? (
          <div className='rounded-lg border border-red-600 bg-red-600/10 p-4 font-bold text-red-700 dark:text-red-400' data-testid='scan-issue-oos'>
            This {noun} is now marked OUT OF SERVICE. Do not use it until it is fixed and returned to service.
          </div>
        ) : null}

        {done.outOfServiceError ? (
          <div className='rounded-lg border border-amber-600 bg-amber-500/10 p-4' role='alert'>
            {done.outOfServiceError}
          </div>
        ) : null}

        <Button asChild size='lg'>
          <Link href={menuHref}>Back to scan menu</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className='flex flex-col gap-4' data-testid='scan-issue-form' noValidate>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='issue-description'>What is wrong? *</Label>
        <Textarea
          id='issue-description'
          name='description'
          value={description}
          onChange={event => setDescription(event.target.value)}
          maxLength={ISSUE_DESCRIPTION_MAX}
          rows={5}
          placeholder='Describe the problem and where it is.'
          aria-invalid={Boolean(fieldErrors.description)}
        />
        {fieldErrors.description ? <p className='text-sm text-red-600'>{fieldErrors.description}</p> : null}
      </div>

      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='issue-title'>Short title (optional)</Label>
        <Input id='issue-title' name='title' value={title} onChange={event => setTitle(event.target.value)} maxLength={ISSUE_TITLE_MAX} placeholder={defaultIssueTitle(targetName)} />
        {fieldErrors.title ? <p className='text-sm text-red-600'>{fieldErrors.title}</p> : null}
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='issue-priority'>How urgent?</Label>
          <select id='issue-priority' name='priority' className={selectClass} value={priority} onChange={event => setPriority(event.target.value as IssueReportPriority)}>
            {ISSUE_REPORT_PRIORITIES.map(key => (
              <option key={key} value={key}>
                {ISSUE_PRIORITY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='issue-category'>Type of issue (optional)</Label>
          <select id='issue-category' name='category' className={selectClass} value={category} onChange={event => setCategory(event.target.value)}>
            <option value=''>Choose…</option>
            {ISSUE_CATEGORIES.map(item => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className='flex items-start gap-3 rounded-lg border border-amber-500/50 p-3'>
        <input type='checkbox' name='immediateHazard' className='mt-1 size-5' checked={immediateHazard} onChange={event => setImmediateHazard(event.target.checked)} />
        <span>
          <span className='flex items-center gap-1 font-semibold'>
            <TbAlertTriangle className='text-amber-600' /> This is an immediate hazard
          </span>
          <span className='text-textSecondary block text-sm'>Someone could get hurt now. The safety team is told right away.</span>
        </span>
      </label>

      {showOutOfService ? (
        <label className='flex items-start gap-3 rounded-lg border border-red-500/50 p-3'>
          <input
            type='checkbox'
            name='outOfService'
            className='mt-1 size-5'
            checked={outOfServiceChecked}
            disabled={immediateHazard}
            onChange={event => setOutOfService(event.target.checked)}
          />
          <span>
            <span className='font-semibold'>Mark this {noun} out of service</span>
            <span className='text-textSecondary block text-sm'>
              {immediateHazard ? 'Required for an immediate hazard.' : 'Tag it out so nobody uses it until it is fixed.'}
            </span>
          </span>
        </label>
      ) : null}

      <div className='flex flex-col gap-2'>
        <Label>Photos (optional, up to {ISSUE_PHOTO_MAX})</Label>
        <div className='flex flex-wrap gap-2' data-testid='scan-issue-photos'>
          {photos.map(photo => (
            <div key={photo.key} className='relative h-24 w-24 overflow-hidden rounded-md border' data-photo-status={photo.status} title={photo.error || photo.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt={photo.name} className={'h-full w-full object-cover ' + (photo.status === 'ready' ? '' : 'opacity-50')} />
              <button
                type='button'
                onClick={() => removePhoto(photo.key)}
                className='absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white'
                aria-label={'Remove ' + photo.name}
              >
                <TbX />
              </button>
              {photo.status !== 'ready' ? (
                <span className={'absolute inset-x-0 bottom-0 px-1 text-center text-xs text-white ' + (photo.status === 'failed' ? 'bg-red-600' : 'bg-black/70')}>
                  {photo.status === 'failed' ? photo.error || 'Failed' : 'Uploading…'}
                </span>
              ) : null}
            </div>
          ))}
          {photos.length < ISSUE_PHOTO_MAX ? (
            <button
              type='button'
              onClick={() => fileInput.current?.click()}
              className='text-textSecondary flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm'
            >
              <TbCamera className='text-2xl' /> Add photo
            </button>
          ) : null}
        </div>
        <input
          ref={fileInput}
          type='file'
          accept={ISSUE_PHOTO_TYPES.join(',')}
          multiple
          className='hidden'
          data-testid='scan-issue-photo-input'
          onChange={event => onFiles(event.target.files)}
        />
        {fieldErrors.photos ? <p className='text-sm text-red-600'>{fieldErrors.photos}</p> : null}
      </div>

      {anonymous ? (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='issue-reporter'>Your name (optional)</Label>
          <Input id='issue-reporter' name='reporterName' value={reporterName} onChange={event => setReporterName(event.target.value)} maxLength={120} autoComplete='name' />
          <p className='text-textSecondary text-xs'>Leave blank to report without your name.</p>
        </div>
      ) : null}

      {error ? (
        <p className='rounded-md border border-red-600/40 bg-red-600/10 p-3 text-sm text-red-700 dark:text-red-400' role='alert'>
          {error}
        </p>
      ) : null}

      <Button type='submit' size='lg' disabled={busy} data-testid='scan-issue-submit'>
        {busy ? 'Sending…' : 'Send report'}
      </Button>
    </form>
  )
}

export default ScanIssueForm
