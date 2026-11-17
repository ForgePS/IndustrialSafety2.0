'use client'

import { TbArrowDown, TbArrowUp, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { SIGNATORY_LABELS, conditionCandidates, conditionValues, isChoiceType } from '@/lib/forgeFormBuilderRules'
import type { FormField, FormFieldType, FormSignatory } from '@/lib/forgeFormRules'
import { FORM_FIELD_TYPES, FORM_FIELD_TYPE_LABELS, inferSignatory, isDisplayField } from '@/lib/forgeFormRules'

/** Port slice 9 (piece A): one field in the builder's field list. */

const selectClass = 'border-input bg-card h-[38px] w-full rounded-md border px-3 text-sm'
const labelClass = 'text-textSecondary text-xs font-medium'

/** Changing the type keeps what still applies (options for choice fields, signatory for signatures). */
export const changeFieldType = (field: FormField, type: FormFieldType): FormField => {
  const next: FormField = { ...field, type }

  if (isChoiceType(type)) next.options = field.options?.length ? field.options : ['Option 1', 'Option 2']
  else delete next.options

  if (type === 'signature') next.signatory = field.signatory || inferSignatory(field)
  else delete next.signatory

  if (type === 'content') next.content = field.content || ''
  else delete next.content

  if (isDisplayField(next)) {
    delete next.required
    delete next.visibleWhen
  }

  return next
}

const FormBuilderFieldEditor = ({
  field,
  index,
  fields,
  onChange,
  onMove,
  onRemove
}: {
  field: FormField
  index: number
  fields: FormField[]
  onChange: (field: FormField) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) => {
  const display = isDisplayField(field)
  const candidates = conditionCandidates(fields, index)
  const target = field.visibleWhen ? fields.find(item => item.id === field.visibleWhen?.fieldId) : undefined
  const values = conditionValues(target)

  const update = (patch: Partial<FormField>) => {
    const next = { ...field, ...patch } as FormField & Record<string, unknown>

    for (const key of Object.keys(patch)) if ((patch as Record<string, unknown>)[key] === undefined) delete next[key]
    onChange(next)
  }

  return (
    <div className='bg-card flex flex-col gap-3 rounded-lg border p-4' data-builder-field={index} data-builder-field-id={field.id}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-textSecondary font-semibold'>#{index + 1}</span>
          <span className='font-medium'>{FORM_FIELD_TYPE_LABELS[field.type]}</span>
          <code className='text-textSecondary text-xs' title='Field id (answers are stored under it)'>
            {field.id}
          </code>
        </div>
        <div className='flex gap-1'>
          <Button type='button' size='sm' variant='outline' aria-label='Move up' disabled={index === 0} onClick={() => onMove(-1)}>
            <TbArrowUp />
          </Button>
          <Button type='button' size='sm' variant='outline' aria-label='Move down' disabled={index === fields.length - 1} onClick={() => onMove(1)}>
            <TbArrowDown />
          </Button>
          <Button type='button' size='sm' variant='outline' aria-label='Remove field' onClick={onRemove}>
            <TbTrash />
          </Button>
        </div>
      </div>

      <div className='grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end'>
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>{field.type === 'section' ? 'Heading' : field.type === 'content' ? 'Title (optional)' : 'Question'}</span>
          <Input aria-label='Field label' value={field.label} onChange={event => update({ label: event.target.value })} />
        </label>
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Type</span>
          <select aria-label='Field type' className={selectClass} value={field.type} onChange={event => onChange(changeFieldType(field, event.target.value as FormFieldType))}>
            {FORM_FIELD_TYPES.map(type => (
              <option key={type} value={type}>
                {FORM_FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        {display ? null : (
          <label className='flex h-[38px] items-center gap-2 text-sm'>
            <input type='checkbox' aria-label='Required' checked={Boolean(field.required)} onChange={event => update({ required: event.target.checked || undefined })} />
            Required
          </label>
        )}
      </div>

      {isChoiceType(field.type) ? (
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Options (one per line)</span>
          <Textarea
            aria-label='Field options'
            rows={Math.min(8, Math.max(3, (field.options || []).length + 1))}
            value={(field.options || []).join('\n')}
            onChange={event => update({ options: event.target.value.split('\n') })}
            onBlur={event => update({ options: event.target.value.split('\n').map(option => option.trim()).filter(Boolean) })}
          />
        </label>
      ) : null}

      {field.type === 'content' ? (
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Instructions text</span>
          <Textarea aria-label='Content text' rows={4} value={field.content || ''} onChange={event => update({ content: event.target.value })} />
        </label>
      ) : null}

      {field.type === 'signature' ? (
        <label className='flex flex-col gap-1 md:max-w-xs'>
          <span className={labelClass}>Who signs</span>
          <select
            aria-label='Signatory'
            className={selectClass}
            value={field.signatory || 'any'}
            onChange={event => update({ signatory: event.target.value as FormSignatory })}
          >
            {(Object.keys(SIGNATORY_LABELS) as FormSignatory[]).map(key => (
              <option key={key} value={key}>
                {SIGNATORY_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {field.type === 'section' ? null : (
        <label className='flex flex-col gap-1'>
          <span className={labelClass}>Help text (optional)</span>
          <Input aria-label='Help text' value={field.help || ''} onChange={event => update({ help: event.target.value || undefined })} />
        </label>
      )}

      {display ? null : (
        <div className='grid gap-3 md:grid-cols-2'>
          <label className='flex flex-col gap-1'>
            <span className={labelClass}>Show only when</span>
            <select
              aria-label='Show only when'
              className={selectClass}
              value={field.visibleWhen?.fieldId || ''}
              onChange={event => {
                const fieldId = event.target.value
                const first = conditionValues(fields.find(item => item.id === fieldId))[0] || ''

                update({ visibleWhen: fieldId ? { fieldId, equals: first } : undefined })
              }}
            >
              <option value=''>Always shown</option>
              {candidates.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              {field.visibleWhen && !candidates.some(item => item.id === field.visibleWhen?.fieldId) ? (
                <option value={field.visibleWhen.fieldId}>{field.visibleWhen.fieldId} (not above this field)</option>
              ) : null}
            </select>
          </label>
          {field.visibleWhen ? (
            <label className='flex flex-col gap-1'>
              <span className={labelClass}>equals</span>
              {values.length ? (
                <select
                  aria-label='Condition value'
                  className={selectClass}
                  value={field.visibleWhen.equals}
                  onChange={event => update({ visibleWhen: { fieldId: field.visibleWhen!.fieldId, equals: event.target.value } })}
                >
                  {values.includes(field.visibleWhen.equals) ? null : <option value={field.visibleWhen.equals}>{field.visibleWhen.equals || '—'}</option>}
                  {values.map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  aria-label='Condition value'
                  value={field.visibleWhen.equals}
                  onChange={event => update({ visibleWhen: { fieldId: field.visibleWhen!.fieldId, equals: event.target.value } })}
                />
              )}
            </label>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default FormBuilderFieldEditor
