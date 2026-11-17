'use client'

import { SIGNATORY_LABELS } from '@/lib/forgeFormBuilderRules'
import type { FormField } from '@/lib/forgeFormRules'
import { FORM_FIELD_TYPE_LABELS } from '@/lib/forgeFormRules'

/** Port slice 9 (piece A): a read-only picture of the form as people will see it. */

const box = 'border-input bg-card text-textSecondary rounded-md border px-3 py-2 text-sm'

const PreviewInput = ({ field }: { field: FormField }) => {
  switch (field.type) {
    case 'textarea':
      return <div className={box + ' h-16'} />
    case 'select':
      return <div className={box}>{field.options?.length ? `Choose: ${field.options.join(' / ')}` : 'Choose...'}</div>
    case 'radio':
    case 'multiselect':
      return (
        <div className='flex flex-wrap gap-3 text-sm'>
          {(field.options || []).map(option => (
            <span key={option} className='flex items-center gap-1.5'>
              <span className={'border-input inline-block size-3.5 border ' + (field.type === 'radio' ? 'rounded-full' : 'rounded-sm')} />
              {option}
            </span>
          ))}
        </div>
      )
    case 'checkbox':
      return <span className='border-input inline-block size-4 rounded-sm border' />
    case 'yesno':
      return (
        <div className='flex flex-col gap-2'>
          <div className='flex gap-2'>
            {['Yes', 'No', 'N/A'].map(option => (
              <span key={option} className='border-input rounded-md border px-3 py-1 text-sm'>
                {option}
              </span>
            ))}
          </div>
          <div className={box}>Notes (required when No)</div>
        </div>
      )
    case 'signature':
      return (
        <div className={box + ' flex h-20 items-end justify-between'}>
          <span>Sign here</span>
          <span className='text-xs'>Signed by: {SIGNATORY_LABELS[field.signatory || 'any']}</span>
        </div>
      )
    case 'photo':
      return <div className={box}>Add photos</div>
    case 'location':
      return <div className={box}>Location</div>
    default:
      return <div className={box}>{FORM_FIELD_TYPE_LABELS[field.type]}</div>
  }
}

const FormBuilderPreview = ({ title, description, fields }: { title: string; description: string; fields: FormField[] }) => {
  const labels = new Map(fields.map(field => [field.id, field.label]))

  return (
    <div className='flex flex-col gap-4' data-form-preview>
      <div>
        <h2 className='text-textPrimary text-xl font-semibold'>{title || 'Untitled form'}</h2>
        {description ? <p className='text-textSecondary mt-1 whitespace-pre-line text-sm'>{description}</p> : null}
      </div>
      {fields.length ? null : <p className='text-textSecondary text-sm'>Add fields to see the form here.</p>}
      {fields.map(field => {
        if (field.type === 'section') {
          return (
            <h3 key={field.id} className='text-textPrimary mt-2 border-b pb-1 text-base font-semibold'>
              {field.label}
            </h3>
          )
        }

        if (field.type === 'content') {
          return (
            <div key={field.id} className='bg-muted/40 rounded-md p-3 text-sm'>
              {field.label && field.label !== 'Instructions' ? <div className='font-medium'>{field.label}</div> : null}
              <div className='whitespace-pre-line'>{field.content || 'Instructions text'}</div>
            </div>
          )
        }

        return (
          <div key={field.id} className='flex flex-col gap-1.5'>
            <div className='text-sm font-medium'>
              {field.label || 'Untitled question'}
              {field.required ? <span className='text-destructive'> *</span> : null}
            </div>
            {field.help ? <div className='text-textSecondary text-xs'>{field.help}</div> : null}
            <PreviewInput field={field} />
            {field.visibleWhen?.fieldId ? (
              <div className='text-textSecondary text-xs italic'>
                Shown only when &quot;{labels.get(field.visibleWhen.fieldId) || field.visibleWhen.fieldId}&quot; is &quot;{field.visibleWhen.equals}&quot;.
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default FormBuilderPreview
