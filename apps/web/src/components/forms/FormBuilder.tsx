'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArchive, TbArrowLeft, TbCopy, TbDeviceFloppy, TbPlus, TbPrinter, TbRestore, TbSend } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import type { TemplateActionResult, TemplateDetails } from '@/app/(back)/forms/templateActions'
import {
  archiveFormTemplate,
  duplicateFormTemplate,
  publishFormTemplate,
  restoreFormTemplate,
  saveFormTemplateDraft
} from '@/app/(back)/forms/templateActions'
import FormBuilderFieldEditor from '@/components/forms/FormBuilderFieldEditor'
import FormBuilderPreview from '@/components/forms/FormBuilderPreview'
import type { FormBuilderInitial, FormBuilderOption } from '@/components/forms/FormBuilderTypes'
import { blankField, formatFieldLines, moveItem, parseFieldLines, renameFieldId, uniqueFieldId } from '@/lib/forgeFormBuilderRules'
import type { FormField, FormFieldType } from '@/lib/forgeFormRules'
import { FORM_FIELD_TYPES, FORM_FIELD_TYPE_LABELS, normalizeFormSchema } from '@/lib/forgeFormRules'

/**
 * Port slice 9 (piece A): the form template builder. Details, a field list (or 1.0's quick text mode), a live
 * preview, Save draft, Publish (a new immutable version), archive / restore and duplicate.
 */

const selectClass = 'border-input bg-card h-[38px] w-full rounded-md border px-3 text-sm'
const labelClass = 'text-textSecondary text-xs font-medium'

const STATUS_LABELS = { draft: 'Draft', active: 'Published', archived: 'Archived' } as const

/** A field with a React key that survives id changes (normalizeFormSchema drops the key on save). */
type BuilderField = FormField & { _key?: string }

let keyCounter = 0

const withKeys = (list: FormField[]): BuilderField[] =>
  list.map(field => ((field as BuilderField)._key ? field : { ...field, _key: `f${(keyCounter += 1)}` }))

const FormBuilder = ({
  initial,
  locations,
  divisions,
  categories
}: {
  initial: FormBuilderInitial
  locations: FormBuilderOption[]
  divisions: FormBuilderOption[]
  categories: string[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [id, setId] = useState(initial.id)
  const [status, setStatus] = useState(initial.status)
  const [version, setVersion] = useState(initial.currentVersion)
  const [unpublished, setUnpublished] = useState(initial.unpublishedChanges)
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [category, setCategory] = useState(initial.category)
  const [locationId, setLocationId] = useState(initial.locationId)
  const [divisionId, setDivisionId] = useState(initial.divisionId)
  const [fields, setFields] = useState<BuilderField[]>(() => withKeys(initial.fields))

  // Ids saved before keep their id (answers are stored under it); new fields take their id from the label.
  const [savedIds, setSavedIds] = useState(() => new Set(initial.fields.map(field => field.id)))
  const [newType, setNewType] = useState<FormFieldType>('text')
  const [mode, setMode] = useState<'fields' | 'text'>('fields')
  const [text, setText] = useState('')
  const [textErrors, setTextErrors] = useState<string[]>([])
  const [serverErrors, setServerErrors] = useState<string[]>([])

  const problems = useMemo(() => {
    const unlabelled = fields.filter(field => !field.label.trim() && !(field.type === 'content' && field.content?.trim())).length

    return [
      ...(unlabelled ? [`${unlabelled} field${unlabelled === 1 ? ' has' : 's have'} no label.`] : []),
      ...normalizeFormSchema({ fields }).errors
    ]
  }, [fields])

  const archived = status === 'archived'

  const updateField = (index: number, next: FormField) => {
    setUnpublished(true)
    setFields(current => {
      const previous = current[index]!
      let list = current.map((field, position) => (position === index ? next : field))

      if (!savedIds.has(previous.id) && next.label !== previous.label) {
        const others = list.filter((_, position) => position !== index).map(field => field.id)
        const newId = uniqueFieldId(next.label || next.type, others)

        if (newId !== previous.id) list = renameFieldId(list, previous.id, newId) as BuilderField[]
      }

      return list
    })
  }

  const addField = () => {
    setUnpublished(true)
    setFields(current => [...current, ...withKeys([blankField(newType, current.map(field => field.id))])])
  }

  /** Text mode → fields. Returns the fields so a save right after uses them. */
  const applyText = () => {
    const parsed = parseFieldLines(text, fields)

    setTextErrors(parsed.errors)
    setFields(withKeys(parsed.fields))
    setUnpublished(true)

    return parsed.fields
  }

  const switchMode = (next: 'fields' | 'text') => {
    if (next === mode) return

    if (next === 'text') {
      setText(formatFieldLines(fields))
      setTextErrors([])
    } else applyText()

    setMode(next)
  }

  const details = (list: FormField[]): TemplateDetails => ({ id, title, description, category, locationId, divisionId, schema: { fields: list } })

  const afterSave = (result: TemplateActionResult & { ok: true }) => {
    if (result.schema) {
      setFields(withKeys(result.schema.fields))
      setSavedIds(new Set(result.schema.fields.map(field => field.id)))
      if (mode === 'text') setText(formatFieldLines(result.schema.fields))
    }

    if (result.status) setStatus(result.status as FormBuilderInitial['status'])

    if (!id) {
      setId(result.id)
      router.replace(`/forms/templates/${result.id}`)
    } else router.refresh()
  }

  const save = (publish: boolean) =>
    startTransition(async () => {
      const list = mode === 'text' ? applyText() : fields
      const result = publish ? await publishFormTemplate(details(list)) : await saveFormTemplateDraft(details(list))

      if (!result.ok) {
        setServerErrors(result.errors || [])
        toast('error', result.error)

        return
      }

      setServerErrors(result.warnings || [])

      if (publish && result.version) {
        setVersion(result.version)
        setUnpublished(false)
      }

      toast('success', result.message)
      afterSave(result)
    })

  const runSimple = (action: () => Promise<TemplateActionResult>, after?: (result: TemplateActionResult & { ok: true }) => void) =>
    startTransition(async () => {
      const result = await action()

      if (!result.ok) {
        toast('error', result.error)

        return
      }

      toast('success', result.message)

      if (after) after(result)
      else {
        if (result.status) setStatus(result.status as FormBuilderInitial['status'])
        router.refresh()
      }
    })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <Link href='/forms?view=manage' className='text-textSecondary flex items-center gap-1 text-sm'>
            <TbArrowLeft />
            Manage templates
          </Link>
          <h1 className='text-textPrimary mt-2 text-3xl font-bold'>{id ? title || 'Untitled form' : 'New form'}</h1>
          <div className='mt-2 flex flex-wrap items-center gap-2' data-builder-status={status} data-builder-version={version}>
            <Badge size='sm' variant={status === 'active' ? 'tonalSuccess' : status === 'archived' ? 'secondary' : 'outline'}>
              {STATUS_LABELS[status]}
            </Badge>
            <Badge size='sm' variant='outline'>
              {version ? `Version ${version}` : 'Never published'}
            </Badge>
            {version && unpublished && !archived ? (
              <span className='text-textSecondary text-xs'>Unpublished changes: people fill version {version} until you publish.</span>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {id && version > 0 && !archived ? (
            <Button asChild variant='outline'>
              <Link href={`/forms/templates/${id}/print`}>
                <TbPrinter />
                Print blank
              </Link>
            </Button>
          ) : null}
          {id ? (
            <Button variant='outline' disabled={pending} onClick={() => runSimple(() => duplicateFormTemplate(id), result => router.push(`/forms/templates/${result.id}`))}>
              <TbCopy />
              Duplicate
            </Button>
          ) : null}
          {id && archived ? (
            <Button variant='outline' disabled={pending} onClick={() => runSimple(() => restoreFormTemplate(id))}>
              <TbRestore />
              Restore
            </Button>
          ) : null}
          {id && !archived ? (
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => {
                if (window.confirm('Archive this form? It can no longer be filled out. Existing submissions are kept.')) runSimple(() => archiveFormTemplate(id))
              }}
            >
              <TbArchive />
              Archive
            </Button>
          ) : null}
          {archived ? null : (
            <>
              <Button variant='outline' disabled={pending} onClick={() => save(false)}>
                <TbDeviceFloppy />
                Save draft
              </Button>
              <Button disabled={pending} onClick={() => save(true)}>
                <TbSend />
                Publish
              </Button>
            </>
          )}
        </div>
      </div>

      {archived ? (
        <div className='rounded-md border p-4 text-sm'>This form is archived and cannot be filled out. Restore it to edit or publish it.</div>
      ) : null}

      {serverErrors.length || problems.length ? (
        <div className='border-destructive/40 rounded-md border p-4 text-sm' data-builder-problems role='status'>
          <div className='font-semibold'>Fix before publishing</div>
          <ul className='mt-1 list-disc pl-5'>
            {[...new Set([...problems, ...serverErrors])].map(problem => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className='grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <label className='flex flex-col gap-1 md:col-span-2'>
                <span className={labelClass}>Title</span>
                <Input name='title' value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />
              </label>
              <label className='flex flex-col gap-1 md:col-span-2'>
                <span className={labelClass}>Description</span>
                <Textarea name='description' rows={2} value={description} maxLength={4000} onChange={event => setDescription(event.target.value)} />
              </label>
              <label className='flex flex-col gap-1'>
                <span className={labelClass}>Category</span>
                <Input name='category' list='form-builder-categories' value={category} maxLength={100} onChange={event => setCategory(event.target.value)} />
                <datalist id='form-builder-categories'>
                  {categories.map(item => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
              <label className='flex flex-col gap-1'>
                <span className={labelClass}>Location (optional)</span>
                <select name='locationId' className={selectClass} value={locationId} onChange={event => setLocationId(event.target.value)}>
                  <option value=''>Any location</option>
                  {locations.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <span className={labelClass}>Division (optional)</span>
                <select name='divisionId' className={selectClass} value={divisionId} onChange={event => setDivisionId(event.target.value)}>
                  <option value=''>Any division</option>
                  {divisions.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
              <CardTitle>Fields</CardTitle>
              <div className='flex gap-1' role='tablist'>
                <Button type='button' size='sm' role='tab' aria-selected={mode === 'fields'} variant={mode === 'fields' ? 'default' : 'outline'} onClick={() => switchMode('fields')}>
                  Field list
                </Button>
                <Button type='button' size='sm' role='tab' aria-selected={mode === 'text'} variant={mode === 'text' ? 'default' : 'outline'} onClick={() => switchMode('text')}>
                  Quick text
                </Button>
              </div>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {mode === 'text' ? (
                <>
                  <p className='text-textSecondary text-sm'>
                    One field per line: <code>id|label|type|required|options</code>. Options are separated by <code>;</code>. The id is optional
                    (<code>label|type</code> works). Types:{' '}
                    {FORM_FIELD_TYPES.join(', ')}.
                  </p>
                  <Textarea aria-label='Fields as text' rows={Math.min(24, Math.max(8, text.split('\n').length + 2))} className='font-mono text-sm' value={text} onChange={event => setText(event.target.value)} />
                  {textErrors.length ? (
                    <ul className='text-destructive list-disc pl-5 text-sm' data-builder-text-errors>
                      {textErrors.map(error => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div>
                    <Button type='button' variant='outline' onClick={() => applyText()}>
                      Apply text
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {fields.length ? null : <p className='text-textSecondary text-sm'>No fields yet. Add the first one below, or use Quick text.</p>}
                  {fields.map((field, index) => (
                    <FormBuilderFieldEditor
                      key={field._key || field.id}
                      field={field}
                      index={index}
                      fields={fields}
                      onChange={next => updateField(index, next)}
                      onMove={direction => {
                        setUnpublished(true)
                        setFields(current => moveItem(current, index, direction))
                      }}
                      onRemove={() => {
                        setUnpublished(true)
                        setFields(current =>
                          current
                            .filter((_, position) => position !== index)
                            .map(item => (item.visibleWhen?.fieldId === field.id ? { ...item, visibleWhen: null } : item))
                        )
                      }}
                    />
                  ))}
                  <div className='flex flex-wrap items-end gap-2'>
                    <label className='flex flex-col gap-1'>
                      <span className={labelClass}>New field type</span>
                      <select aria-label='New field type' className={selectClass + ' min-w-[220px]'} value={newType} onChange={event => setNewType(event.target.value as FormFieldType)}>
                        {FORM_FIELD_TYPES.map(type => (
                          <option key={type} value={type}>
                            {FORM_FIELD_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type='button' variant='outline' onClick={addField}>
                      <TbPlus />
                      Add field
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className='self-start xl:sticky xl:top-4'>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <FormBuilderPreview title={title} description={description} fields={mode === 'text' ? parseFieldLines(text, fields).fields : fields} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default FormBuilder
