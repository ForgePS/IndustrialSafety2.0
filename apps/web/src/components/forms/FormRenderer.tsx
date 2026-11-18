'use client'

import { useCallback, useRef, useState } from 'react'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'

import SignaturePad from '@/components/common/SignaturePad'
import type { FormField, FormSchema, SignatureAnswer } from '@/lib/forgeFormRules'
import { YES_NO_NA_OPTIONS, formatAnswer, isDeferredSignatureField, isFieldVisible, isSignatureAnswerPresent, yesNoNotesFieldId } from '@/lib/forgeFormRules'

/**
 * Port slice 9: renders a form for filling, editing or reading (1.0 forms-workspace fill tab and the field
 * app's form runner). Every field type, visibleWhen conditions, per-field errors.
 *
 * Signatures: an 'any' signature is drawn here by the person filling the form. Supervisor and EHS Director
 * signatures are never drawn here; they show who signed, or that they are signed later.
 */

export const MAX_FORM_PHOTOS = 5

export const formPhotoUrl = (photoId: string) => `/forms/submissions/photos/${photoId}`

export type FormRendererProps = {
  schema: FormSchema
  answers: Record<string, unknown>
  onChange?: (answers: Record<string, unknown>) => void
  errors?: Record<string, string>
  readOnly?: boolean

  /** The submission photos are attached to (a reserved id for a new form). Without it, photo fields cannot upload. */
  photoSubmissionId?: string | null

  /** Prefilled signer name for 'any' signatures. */
  defaultSignerName?: string
}

const fieldDomId = (id: string) => `form-field-${id}`

const DEFERRED_LABEL: Record<string, string> = {
  supervisor: 'Signed later by a supervisor.',
  ehs_director: 'Signed later by the EHS Director.'
}

const SignatureView = ({ value }: { value: SignatureAnswer }) => (
  <div className='flex flex-col gap-1' data-signature-signed>
    {value.image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value.image} alt={`Signature of ${value.signedByName || 'signer'}`} className='h-20 max-w-xs rounded border bg-white object-contain' />
    ) : null}
    <span className='text-textSecondary text-xs'>
      Signed by {value.signedByName || 'unknown'}
      {value.signedAt ? ` on ${new Date(value.signedAt).toLocaleString()}` : ''}
      {value.method === 'remote_link' ? ' (by link)' : value.method === 'imported' ? ' (imported)' : ''}
    </span>
  </div>
)

const SignatureInput = ({
  field,
  value,
  onChange,
  defaultSignerName
}: {
  field: FormField
  value: unknown
  onChange: (value: SignatureAnswer | undefined) => void
  defaultSignerName: string
}) => {
  const [name, setName] = useState(defaultSignerName)

  // True while this signature is being drawn here; a stored signature is shown instead of the pad.
  const [fresh, setFresh] = useState(false)
  const nameRef = useRef(name)
  const present = isSignatureAnswerPresent(value)

  nameRef.current = name

  const onDraw = useCallback(
    (image: string | null) => {
      if (!image) return onChange(undefined)

      setFresh(true)
      onChange({ image, signedAt: new Date().toISOString(), signedByName: nameRef.current.trim(), signedByUserId: null, method: 'in_app' })
    },
    [onChange]
  )

  const rename = (next: string) => {
    setName(next)
    if (fresh && present && typeof value === 'object') onChange({ ...(value as SignatureAnswer), signedByName: next.trim() })
  }

  if (present && typeof value === 'object' && !fresh) {
    return (
      <div className='flex flex-wrap items-end gap-3'>
        <SignatureView value={value as SignatureAnswer} />
        <Button type='button' size='sm' variant='outline' onClick={() => onChange(undefined)}>
          Clear signature
        </Button>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-col gap-1'>
        <Label htmlFor={`${fieldDomId(field.id)}-name`} className='text-xs'>
          Signer name
        </Label>
        <Input id={`${fieldDomId(field.id)}-name`} value={name} maxLength={200} onChange={event => rename(event.target.value)} />
      </div>
      <SignaturePad label={field.label} onChange={onDraw} />
    </div>
  )
}

const PhotoInput = ({
  field,
  value,
  onChange,
  submissionId
}: {
  field: FormField
  value: unknown
  onChange: (ids: string[]) => void
  submissionId: string | null | undefined
}) => {
  const ids = Array.isArray(value) ? value.map(String) : []
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: FileList | null) => {
    if (!files?.length || !submissionId) return

    setError(null)

    const room = MAX_FORM_PHOTOS - ids.length
    const chosen = Array.from(files).slice(0, Math.max(room, 0))

    if (files.length > room) setError(`At most ${MAX_FORM_PHOTOS} photos per question.`)

    setBusy(true)

    const added: string[] = []

    for (const file of chosen) {
      const body = new FormData()

      body.set('submissionId', submissionId)
      body.set('file', file)

      const response = await fetch('/forms/submissions/photos', { method: 'POST', body }).catch(() => null)
      const result = response ? await response.json().catch(() => ({})) : {}

      if (!response?.ok || !result.id) {
        setError(result.error || 'Unable to upload the photo.')
        break
      }

      added.push(result.id)
    }

    setBusy(false)
    if (added.length) onChange([...ids, ...added])
  }

  return (
    <div className='flex flex-col gap-2'>
      {ids.length ? (
        <div className='flex flex-wrap gap-3'>
          {ids.map(id => (
            <div key={id} className='flex flex-col items-start gap-1' data-form-photo={id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={formPhotoUrl(id)} alt={`${field.label} photo`} className='h-24 w-24 rounded border object-cover' />
              <Button type='button' size='sm' variant='outline' onClick={() => onChange(ids.filter(item => item !== id))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {ids.length < MAX_FORM_PHOTOS ? (
        <input
          id={fieldDomId(field.id)}
          type='file'
          accept='image/jpeg,image/png,image/webp'
          multiple
          disabled={busy || !submissionId}
          onChange={event => {
            void upload(event.target.files)
            event.target.value = ''
          }}
          className='text-sm'
        />
      ) : null}
      {busy ? <span className='text-textSecondary text-xs'>Uploading...</span> : null}
      {error ? <span className='text-destructive text-xs'>{error}</span> : null}
    </div>
  )
}

const ReadOnlyValue = ({ field, answers }: { field: FormField; answers: Record<string, unknown> }) => {
  const value = answers[field.id]

  if (field.type === 'signature') {
    if (isSignatureAnswerPresent(value) && typeof value === 'object') return <SignatureView value={value as SignatureAnswer} />

    return (
      <span className='text-textSecondary text-sm' data-signature-missing>
        {isDeferredSignatureField(field) ? `Not signed yet. ${DEFERRED_LABEL[field.signatory || ''] || ''}` : 'Not signed.'}
      </span>
    )
  }

  if (field.type === 'photo') {
    const ids = Array.isArray(value) ? value.map(String) : []

    if (!ids.length) return <span className='text-textSecondary text-sm'>No photos.</span>

    return (
      <div className='flex flex-wrap gap-3'>
        {ids.map(id => (
          <a key={id} href={formPhotoUrl(id)} target='_blank' rel='noreferrer' data-form-photo={id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formPhotoUrl(id)} alt={`${field.label} photo`} className='h-24 w-24 rounded border object-cover' />
          </a>
        ))}
      </div>
    )
  }

  const text = formatAnswer(field, value)
  const note = field.type === 'yesno' ? String(answers[yesNoNotesFieldId(field.id)] ?? '') : ''

  return (
    <div className='flex flex-col gap-1'>
      <span className='whitespace-pre-wrap text-sm' data-form-answer={field.id}>
        {text || <span className='text-textSecondary'>No answer</span>}
      </span>
      {note ? <span className='text-textSecondary whitespace-pre-wrap text-sm'>Notes: {note}</span> : null}
    </div>
  )
}

const FormRenderer = ({ schema, answers, onChange, errors = {}, readOnly = false, photoSubmissionId, defaultSignerName = '' }: FormRendererProps) => {
  const answersRef = useRef(answers)

  answersRef.current = answers

  const set = useCallback(
    (id: string, value: unknown) => {
      if (!onChange) return

      const next = { ...answersRef.current }

      if (value === undefined) delete next[id]
      else next[id] = value

      answersRef.current = next
      onChange(next)
    },
    [onChange]
  )

  const setters = useRef(new Map<string, (value: SignatureAnswer | undefined) => void>())

  const signatureSetter = (id: string) => {
    let setter = setters.current.get(id)

    if (!setter) {
      setter = value => set(id, value)
      setters.current.set(id, setter)
    }

    return setter
  }

  const editable = !readOnly && Boolean(onChange)

  return (
    <div className='flex flex-col gap-5' data-form-renderer={readOnly ? 'read' : 'fill'}>
      {schema.fields.map(field => {
        if (!isFieldVisible(field, answers)) return null

        if (field.type === 'section') {
          return (
            <h3 key={field.id} className='text-textPrimary border-b pb-1 pt-2 text-lg font-semibold'>
              {field.label}
            </h3>
          )
        }

        if (field.type === 'content') {
          return (
            <p key={field.id} className='text-textSecondary whitespace-pre-wrap text-sm'>
              {field.content || field.label}
            </p>
          )
        }

        const id = fieldDomId(field.id)
        const value = answers[field.id]
        const error = errors[field.id]
        const text = typeof value === 'string' ? value : value == null ? '' : String(value)
        const invalid = error ? true : undefined

        let control: React.ReactNode = null

        if (!editable) {
          control = <ReadOnlyValue field={field} answers={answers} />
        } else if (field.type === 'signature') {
          if (isDeferredSignatureField(field)) {
            control = isSignatureAnswerPresent(value) && typeof value === 'object' ? (
              <SignatureView value={value as SignatureAnswer} />
            ) : (
              <span className='text-textSecondary text-sm' data-signature-deferred={field.signatory}>
                {DEFERRED_LABEL[field.signatory || '']}
              </span>
            )
          } else {
            control = <SignatureInput field={field} value={value} onChange={signatureSetter(field.id)} defaultSignerName={defaultSignerName} />
          }
        } else if (field.type === 'photo') {
          control = <PhotoInput field={field} value={value} onChange={ids => set(field.id, ids)} submissionId={photoSubmissionId} />
        } else if (field.type === 'yesno') {
          const notesId = yesNoNotesFieldId(field.id)

          control = (
            <div className='flex flex-col gap-2'>
              <div role='radiogroup' aria-labelledby={`${id}-label`} className='flex flex-wrap gap-4'>
                {YES_NO_NA_OPTIONS.map(option => (
                  <label key={option} className='flex items-center gap-2 text-sm'>
                    <input type='radio' name={id} value={option} checked={text === option} onChange={() => set(field.id, option)} />
                    {option}
                  </label>
                ))}
              </div>
              {text === 'No' ? (
                <div className='flex flex-col gap-1'>
                  <Label htmlFor={`${id}-notes`} className='text-xs'>
                    Notes for {field.label} (required for No)
                  </Label>
                  <Textarea id={`${id}-notes`} rows={2} value={String(answers[notesId] ?? '')} onChange={event => set(notesId, event.target.value)} />
                </div>
              ) : null}
            </div>
          )
        } else if (field.type === 'checkbox') {
          control = (
            <label className='flex items-center gap-2 text-sm'>
              <input id={id} type='checkbox' checked={value === true} onChange={event => set(field.id, event.target.checked)} />
              {field.help || 'Yes'}
            </label>
          )
        } else if (field.type === 'radio') {
          control = (
            <div role='radiogroup' aria-labelledby={`${id}-label`} className='flex flex-wrap gap-4'>
              {(field.options || []).map(option => (
                <label key={option} className='flex items-center gap-2 text-sm'>
                  <input type='radio' name={id} value={option} checked={text === option} onChange={() => set(field.id, option)} />
                  {option}
                </label>
              ))}
            </div>
          )
        } else if (field.type === 'multiselect') {
          const list = Array.isArray(value) ? value.map(String) : []

          control = (
            <div className='flex flex-wrap gap-4'>
              {(field.options || []).map(option => (
                <label key={option} className='flex items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={list.includes(option)}
                    onChange={event => set(field.id, event.target.checked ? [...list, option] : list.filter(item => item !== option))}
                  />
                  {option}
                </label>
              ))}
            </div>
          )
        } else if (field.type === 'select') {
          control = (
            <select
              id={id}
              value={text}
              onChange={event => set(field.id, event.target.value)}
              aria-invalid={invalid}
              className='border-input bg-background h-10 rounded-md border px-3 text-sm'
            >
              <option value=''>Choose...</option>
              {(field.options || []).map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )
        } else if (field.type === 'textarea') {
          control = <Textarea id={id} rows={4} value={text} onChange={event => set(field.id, event.target.value)} aria-invalid={invalid} />
        } else {
          const inputType =
            field.type === 'number'
              ? 'number'
              : field.type === 'date'
                ? 'date'
                : field.type === 'time'
                  ? 'time'
                  : field.type === 'email'
                    ? 'email'
                    : field.type === 'tel'
                      ? 'tel'
                      : 'text'

          control = <Input id={id} type={inputType} value={text} onChange={event => set(field.id, event.target.value)} aria-invalid={invalid} />
        }

        const labelFor = editable && !['yesno', 'radio', 'multiselect', 'signature', 'checkbox'].includes(field.type) ? id : undefined

        return (
          <div key={field.id} className='flex flex-col gap-2' data-form-field={field.id}>
            {labelFor ? (
              <Label id={`${id}-label`} htmlFor={labelFor} className='font-medium'>
                {field.label}
                {field.required ? <span className='text-destructive'> *</span> : null}
              </Label>
            ) : (
              <span id={`${id}-label`} className='text-sm font-medium'>
                {field.label}
                {field.required && editable ? <span className='text-destructive'> *</span> : null}
              </span>
            )}
            {field.help && field.type !== 'checkbox' ? <span className='text-textSecondary text-xs'>{field.help}</span> : null}
            {control}
            {error ? (
              <span className='text-destructive text-sm' data-field-error={field.id} role='alert'>
                {error}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default FormRenderer
