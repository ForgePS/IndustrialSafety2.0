import type { ReactNode } from 'react'

import Link from 'next/link'

import type { FormField, SignatureAnswer } from '@/lib/forgeFormRules'
import { formatAnswer, isDeferredSignatureField, isFieldVisible, isSignatureAnswerPresent, YES_NO_NA_OPTIONS, yesNoNotesFieldId } from '@/lib/forgeFormRules'
import FormPrintButton from './FormPrintButton'

/**
 * Port slice 9: printable form, blank (paper form with write-in lines and boxes) or filled (a submission's
 * answers). Port of 1.0 platform-api industrial/form-print.ts buildFormSubmissionPrintableHtml, letter size.
 * The app chrome stays on screen and is hidden when printing, like the RCA print page.
 */

const PRINT_CSS = `@page { size: letter; margin: 0.5in; }
@media print {
  body * { visibility: hidden !important; }
  [data-form-print], [data-form-print] * { visibility: visible !important; }
  [data-form-print] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; padding: 0; border: 0; box-shadow: none; color: #111827; background: #fff; font-size: 10.5pt; }
  [data-print-hide] { display: none !important; }
  [data-form-print] .form-print-row, [data-form-print] .form-print-signature { break-inside: avoid; }
  [data-form-print] h2 { break-after: avoid; }
}
[data-form-print] .form-print-line { display: block; min-height: 1.5em; border-bottom: 1px solid #9ca3af; }
[data-form-print] .form-print-box { display: inline-block; width: 0.9em; height: 0.9em; border: 1px solid #374151; vertical-align: -0.1em; margin-inline-end: 0.3em; }
[data-form-print] .form-print-sig { max-height: 90px; max-width: 320px; background: #fff; border: 1px solid #d1d5db; }`

export type FormPrintMeta = { label: string; value: string }

const Box = ({ checked = false }: { checked?: boolean }) => (
  <span className='form-print-box text-center text-[0.75em] leading-[0.9em]' aria-hidden='true'>
    {checked ? '✓' : ''}
  </span>
)

const safeImage = (value: unknown) => {
  const image = typeof value === 'string' ? value.trim() : ''

  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(image) || /^https?:\/\//i.test(image) ? image : ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return ''

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

const SIGNATORY_LABELS: Record<string, string> = { supervisor: 'Supervisor', ehs_director: 'EHS Director' }

const Row = ({ field, children }: { field: FormField; children: ReactNode }) => (
  <div className='form-print-row grid grid-cols-[34%_minmax(0,1fr)] gap-3 border-b py-2' data-print-field={field.id}>
    <div className='font-semibold'>
      {field.label}
      {field.required ? <span aria-hidden='true'> *</span> : null}
      {field.help ? <div className='text-textSecondary text-xs font-normal'>{field.help}</div> : null}
    </div>
    <div className='min-w-0'>{children}</div>
  </div>
)

const BlankValue = ({ field }: { field: FormField }) => {
  switch (field.type) {
    case 'textarea':
      return (
        <>
          <span className='form-print-line' />
          <span className='form-print-line' />
          <span className='form-print-line' />
        </>
      )
    case 'select':
    case 'radio':
    case 'multiselect':
      return (
        <div className='flex flex-col gap-1'>
          <span className='text-textSecondary text-xs'>{field.type === 'multiselect' ? 'Mark all that apply' : 'Mark one'}</span>
          <div className='flex flex-wrap gap-x-4 gap-y-1'>
            {(field.options || []).map(option => (
              <span key={option}>
                <Box />
                {option}
              </span>
            ))}
          </div>
        </div>
      )
    case 'checkbox':
      return (
        <span>
          <Box /> Yes
        </span>
      )
    case 'yesno':
      return (
        <div className='flex flex-col gap-1'>
          <div className='flex gap-4'>
            {YES_NO_NA_OPTIONS.map(option => (
              <span key={option}>
                <Box />
                {option}
              </span>
            ))}
          </div>
          <div className='text-textSecondary text-xs'>Notes (required if No)</div>
          <span className='form-print-line' />
        </div>
      )
    case 'photo':
      return <div className='text-textSecondary h-16 rounded border border-dashed p-2 text-xs'>Attach photos separately</div>
    case 'date':
      return (
        <>
          <span className='form-print-line' />
          <span className='text-textSecondary text-xs'>MM / DD / YYYY</span>
        </>
      )
    case 'time':
      return (
        <>
          <span className='form-print-line' />
          <span className='text-textSecondary text-xs'>HH : MM</span>
        </>
      )
    default:
      return <span className='form-print-line' />
  }
}

const SignatureBlock = ({ field, value, blank }: { field: FormField; value: unknown; blank: boolean }) => {
  const signatory = field.signatory ? SIGNATORY_LABELS[field.signatory] : null
  const signature = (value && typeof value === 'object' ? value : typeof value === 'string' ? { image: value } : {}) as Partial<SignatureAnswer>
  const image = blank ? '' : safeImage(signature.image)
  const signed = !blank && isSignatureAnswerPresent(value)

  return (
    <div className='form-print-signature flex flex-col gap-1 border-b py-3' data-print-field={field.id} data-print-signature={signed ? 'signed' : 'blank'}>
      <div className='font-semibold'>
        {field.label}
        {signatory ? <span className='text-textSecondary font-normal'> ({signatory})</span> : null}
      </div>
      {signed ? (
        <div className='flex flex-col gap-1'>
          {image ? <img src={image} alt={`${field.label} signature`} className='form-print-sig' data-testid='form-print-signature-image' /> : null}
          <div className='text-sm'>
            {signature.signedByName ? `Signed by ${signature.signedByName}` : 'Signed'}
            {signature.signedAt ? ` · ${formatDateTime(signature.signedAt)}` : ''}
            {signature.method === 'imported' ? ' · imported from Forge 1.0' : signature.method === 'remote_link' ? ' · signed by link' : ''}
          </div>
        </div>
      ) : blank ? (
        <div className='grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] gap-4 pt-6 text-xs' data-testid='form-print-signature-line'>
          <div className='border-t border-gray-500 pt-1'>Signature</div>
          <div className='border-t border-gray-500 pt-1'>Printed name</div>
          <div className='border-t border-gray-500 pt-1'>Date</div>
        </div>
      ) : (
        <div className='text-textSecondary text-sm italic'>{isDeferredSignatureField(field) ? `Awaiting ${signatory || 'signature'}` : 'Not signed'}</div>
      )}
    </div>
  )
}

const FilledValue = ({ field, answers }: { field: FormField; answers: Record<string, unknown> }) => {
  const value = answers[field.id]

  if (field.type === 'yesno') {
    const note = String(answers[yesNoNotesFieldId(field.id)] ?? '').trim()

    return (
      <div>
        <div className='flex gap-4'>
          {YES_NO_NA_OPTIONS.map(option => (
            <span key={option}>
              <Box checked={value === option} />
              {option}
            </span>
          ))}
        </div>
        {note ? (
          <div className='mt-1 whitespace-pre-wrap text-sm' data-testid='form-print-yesno-note'>
            Notes: {note}
          </div>
        ) : null}
      </div>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <span>
        <Box checked={value === true} />
        {value === true ? 'Yes' : 'No'}
      </span>
    )
  }

  if (field.type === 'photo') {
    const ids = (Array.isArray(value) ? value : []).map(String).filter(id => UUID.test(id))

    if (!ids.length) return <span className='text-textSecondary'>{formatAnswer(field, value) || '—'}</span>

    return (
      <div className='flex flex-wrap gap-2'>
        {ids.map(id => (
          <img key={id} src={`/forms/submissions/photos/${id}`} alt='Form photo' className='h-24 w-24 rounded border object-cover' />
        ))}
      </div>
    )
  }

  const display = formatAnswer(field, value)

  return display ? <span className='whitespace-pre-wrap'>{display}</span> : <span className='text-textSecondary'>—</span>
}

export type FormPrintSheetProps = {
  companyName: string
  title: string
  subtitle: string
  fields: FormField[]
  meta: FormPrintMeta[]
  footer: string
  backHref: string
  backLabel: string
} & ({ mode: 'blank' } | { mode: 'filled'; answers: Record<string, unknown> })

const FormPrintSheet = (props: FormPrintSheetProps) => {
  const { companyName, title, subtitle, fields, meta, footer, backHref, backLabel } = props
  const blank = props.mode === 'blank'
  const answers = props.mode === 'filled' ? props.answers : {}
  const shown = blank ? fields : fields.filter(field => isFieldVisible(field, answers))
  const printed = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div data-form-print={props.mode} className='bg-card mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-lg p-6 text-sm'>
      <style>{PRINT_CSS}</style>
      <div data-print-hide className='flex flex-wrap items-center gap-3'>
        <FormPrintButton />
        <Link className='text-primary underline' href={backHref}>
          {backLabel}
        </Link>
      </div>

      <header className='flex flex-wrap items-end justify-between gap-3 border-b-2 pb-3'>
        <div className='font-semibold' data-testid='form-print-company'>
          {companyName}
        </div>
        <div className='text-end'>
          <h1 className='text-2xl font-bold' data-testid='form-print-title'>
            {title}
          </h1>
          <div className='text-textSecondary' data-testid='form-print-subtitle'>
            {subtitle}
          </div>
        </div>
      </header>

      {meta.length ? (
        <dl className='grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-1'>
          {meta.map(item => (
            <div key={item.label} className='contents'>
              <dt className='font-semibold'>{item.label}</dt>
              <dd data-print-meta={item.label}>{item.value || '—'}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className='flex flex-col'>
        {shown.length ? null : <p className='text-textSecondary italic'>This form has no fields.</p>}
        {shown.map(field => {
          if (field.type === 'section') {
            return (
              <h2 key={field.id} className='mt-4 border-b pb-1 text-sm font-bold uppercase tracking-wide'>
                {field.label}
              </h2>
            )
          }

          if (field.type === 'content') {
            return (
              <section key={field.id} className='my-2 rounded border bg-gray-50 p-3 text-gray-900'>
                {field.label && field.label !== 'Instructions' ? <div className='mb-1 font-semibold'>{field.label}</div> : null}
                <p className='whitespace-pre-wrap'>{field.content || ''}</p>
              </section>
            )
          }

          if (field.type === 'signature') return <SignatureBlock key={field.id} field={field} value={answers[field.id]} blank={blank} />

          return <Row key={field.id} field={field}>{blank ? <BlankValue field={field} /> : <FilledValue field={field} answers={answers} />}</Row>
        })}
      </div>

      <div className='text-textSecondary mt-4 flex justify-between gap-3 border-t pt-2 text-xs'>
        <span>{footer}</span>
        <span data-testid='form-print-date'>Printed {printed}</span>
      </div>
    </div>
  )
}

export default FormPrintSheet
