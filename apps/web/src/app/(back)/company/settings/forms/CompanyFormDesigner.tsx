'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbEye, TbEyeOff, TbLock, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { saveCompanyFormField, saveCompanyFormPresentation } from './actions'

type Lookup = { id: string; name: string }

type Field = {
  id: string
  field_key: string
  label: string
  help_text: string | null
  placeholder: string | null
  field_type: string
  lookup_id: string | null
  section_label: string
  sort_order: number
  width: string
  is_required: boolean
  is_visible: boolean
  can_rename: boolean
  can_change_help: boolean
  can_change_placeholder: boolean
  can_hide: boolean
  can_reorder: boolean
  can_change_required: boolean
  can_change_input_type: boolean
  can_change_lookup: boolean
  override: any | null
}

type Form = {
  id: string
  form_key: string
  name: string
  description: string | null
  submit_label: string
  cancel_label: string
  editMode: 'none' | 'presentation' | 'fields' | 'full'
  canHideFields: boolean
  canReorderFields: boolean
  canChangeRequired: boolean
  canChangeInputType: boolean
  canChangeLookup: boolean
  override: any | null
  fields: Field[]
}

const CompanyFormDesigner = ({
  forms,
  lookups,
  canManage
}: {
  forms: Form[]
  lookups: Lookup[]
  canManage: boolean
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selectedFormId, setSelectedFormId] = useState(forms[0]?.id ?? '')
  const [selectedFieldId, setSelectedFieldId] = useState(forms[0]?.fields?.[0]?.id ?? '')

  const selectedForm = forms.find(form => form.id === selectedFormId) || forms[0]
  const selectedField = selectedForm?.fields.find(field => field.id === selectedFieldId) || selectedForm?.fields?.[0]

  const [formDrafts, setFormDrafts] = useState<Record<string, any>>(
    Object.fromEntries(forms.map(form => [
      form.id,
      {
        name: form.override?.name ?? form.name,
        description: form.override?.description ?? form.description ?? '',
        submitLabel: form.override?.submit_label ?? form.submit_label,
        cancelLabel: form.override?.cancel_label ?? form.cancel_label
      }
    ]))
  )

  const [fieldDrafts, setFieldDrafts] = useState<Record<string, any>>(
    Object.fromEntries(forms.flatMap(form => form.fields.map(field => [
      field.id,
      {
        label: field.override?.label ?? field.label,
        helpText: field.override?.help_text ?? field.help_text ?? '',
        placeholder: field.override?.placeholder ?? field.placeholder ?? '',
        fieldType: field.override?.field_type ?? field.field_type,
        lookupId: field.override?.lookup_id ?? field.lookup_id ?? null,
        sectionLabel: field.override?.section_label ?? field.section_label,
        sortOrder: field.override?.sort_order ?? field.sort_order,
        width: field.override?.width ?? field.width,
        isRequired: field.override?.is_required ?? field.is_required,
        isVisible: field.override?.is_visible ?? field.is_visible
      }
    ])))
  )

  const filteredForms = useMemo(() => {
    const q = search.trim().toLowerCase()
    return forms.filter(form =>
      !q ||
      form.name.toLowerCase().includes(q) ||
      form.form_key.toLowerCase().includes(q)
    )
  }, [forms, search])

  const selectForm = (form: Form) => {
    setSelectedFormId(form.id)
    setSelectedFieldId(form.fields[0]?.id ?? '')
  }

  const saveForm = () => {
    if (!selectedForm || !canManage) return
    const draft = formDrafts[selectedForm.id]

    startTransition(async () => {
      const result = await saveCompanyFormPresentation({
        formId: selectedForm.id,
        name: draft.name,
        description: draft.description,
        submitLabel: draft.submitLabel,
        cancelLabel: draft.cancelLabel
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save form.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveField = () => {
    if (!selectedForm || !selectedField || !canManage) return
    const draft = fieldDrafts[selectedField.id]

    startTransition(async () => {
      const result = await saveCompanyFormField({
        formId: selectedForm.id,
        fieldId: selectedField.id,
        label: draft.label,
        helpText: draft.helpText,
        placeholder: draft.placeholder,
        fieldType: draft.fieldType,
        lookupId: draft.lookupId || null,
        sectionLabel: draft.sectionLabel,
        sortOrder: Number(draft.sortOrder),
        width: draft.width,
        isRequired: Boolean(draft.isRequired),
        isVisible: Boolean(draft.isVisible)
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save field.')
        return
      }

      toast('success', result.message)
    })
  }

  if (!forms.length) {
    return <Card><CardContent className='p-6'>No customizable forms are available.</CardContent></Card>
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[280px_300px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search forms...' className='pl-10' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forms</CardTitle>
            <CardDescription>Only forms opened by Forge Creator are shown.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2'>
            {filteredForms.map(form => (
              <button
                type='button'
                key={form.id}
                onClick={() => selectForm(form)}
                className={`rounded-lg border p-3 text-left ${selectedForm?.id === form.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-textPrimary font-semibold'>{formDrafts[form.id].name}</span>
                  {form.editMode === 'none' ? <TbLock /> : null}
                </div>
                <div className='text-textSecondary mt-1 text-xs'>{form.form_key}</div>
                <Badge size='sm' variant='outline' className='mt-2'>{form.editMode}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
          <CardDescription>{selectedForm ? formDrafts[selectedForm.id].name : ''}</CardDescription>
        </CardHeader>
        <CardContent className='flex max-h-[75vh] flex-col gap-2 overflow-y-auto'>
          {selectedForm?.fields
            .slice()
            .sort((a,b) => (fieldDrafts[a.id]?.sortOrder ?? a.sort_order) - (fieldDrafts[b.id]?.sortOrder ?? b.sort_order))
            .map(field => {
              const draft = fieldDrafts[field.id]
              return (
                <button
                  type='button'
                  key={field.id}
                  onClick={() => setSelectedFieldId(field.id)}
                  className={`rounded-lg border p-3 text-left ${selectedField?.id === field.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
                >
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-medium'>{draft.label}</span>
                    {draft.isVisible ? <TbEye /> : <TbEyeOff />}
                  </div>
                  <div className='text-textSecondary mt-1 text-xs'>{field.field_key}</div>
                </button>
              )
            })}
        </CardContent>
      </Card>

      <div className='flex flex-col gap-6'>
        {selectedForm ? (
          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <CardTitle>Form Presentation</CardTitle>
                  <CardDescription>Change wording without changing protected system behavior.</CardDescription>
                </div>
                {selectedForm.editMode !== 'none' && canManage ? (
                  <Button onClick={saveForm} disabled={pending}>Save Form</Button>
                ) : <Badge variant='secondary'>Locked by Forge</Badge>}
              </div>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div>
                <Label>Form Name</Label>
                <Input className='mt-2' disabled={!canManage || selectedForm.editMode === 'none'} value={formDrafts[selectedForm.id].name} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],name:e.target.value}}))} />
              </div>
              <div>
                <Label>Save Button</Label>
                <Input className='mt-2' disabled={!canManage || selectedForm.editMode === 'none'} value={formDrafts[selectedForm.id].submitLabel} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],submitLabel:e.target.value}}))} />
              </div>
              <div>
                <Label>Cancel Button</Label>
                <Input className='mt-2' disabled={!canManage || selectedForm.editMode === 'none'} value={formDrafts[selectedForm.id].cancelLabel} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],cancelLabel:e.target.value}}))} />
              </div>
              <div className='md:col-span-2'>
                <Label>Description</Label>
                <Textarea className='mt-2' rows={2} disabled={!canManage || selectedForm.editMode === 'none'} value={formDrafts[selectedForm.id].description} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],description:e.target.value}}))} />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {selectedForm && selectedField ? (() => {
          const draft = fieldDrafts[selectedField.id]
          const fieldsEditable = canManage && ['fields','full'].includes(selectedForm.editMode)

          return (
            <Card>
              <CardHeader>
                <div className='flex flex-wrap items-start justify-between gap-4'>
                  <div>
                    <CardTitle>{draft.label}</CardTitle>
                    <CardDescription>{selectedField.field_key}</CardDescription>
                  </div>
                  {fieldsEditable ? <Button onClick={saveField} disabled={pending}>Save Field</Button> : <Badge variant='secondary'>Field editing locked</Badge>}
                </div>
              </CardHeader>
              <CardContent className='grid gap-4 md:grid-cols-2'>
                <div>
                  <Label>Visible Label</Label>
                  <Input className='mt-2' disabled={!fieldsEditable || !selectedField.can_rename} value={draft.label} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],label:e.target.value}}))} />
                </div>
                <div>
                  <Label>Section</Label>
                  <Input className='mt-2' disabled={!fieldsEditable} value={draft.sectionLabel} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],sectionLabel:e.target.value}}))} />
                </div>
                <div className='md:col-span-2'>
                  <Label>Help Text</Label>
                  <Textarea className='mt-2' rows={2} disabled={!fieldsEditable || !selectedField.can_change_help} value={draft.helpText} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],helpText:e.target.value}}))} />
                </div>
                <div>
                  <Label>Placeholder</Label>
                  <Input className='mt-2' disabled={!fieldsEditable || !selectedField.can_change_placeholder} value={draft.placeholder} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],placeholder:e.target.value}}))} />
                </div>
                <div>
                  <Label>Width</Label>
                  <select disabled={!fieldsEditable} value={draft.width} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],width:e.target.value}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'>
                    <option value='quarter'>Quarter</option>
                    <option value='third'>Third</option>
                    <option value='half'>Half</option>
                    <option value='two_thirds'>Two Thirds</option>
                    <option value='three_quarters'>Three Quarters</option>
                    <option value='full'>Full</option>
                  </select>
                </div>
                <div>
                  <Label>Order</Label>
                  <Input type='number' className='mt-2' disabled={!fieldsEditable || !selectedForm.canReorderFields || !selectedField.can_reorder} value={draft.sortOrder} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],sortOrder:Number(e.target.value)}}))} />
                </div>
                <div>
                  <Label>Dropdown Source</Label>
                  <select disabled={!fieldsEditable || !selectedForm.canChangeLookup || !selectedField.can_change_lookup} value={draft.lookupId || ''} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],lookupId:e.target.value || null}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'>
                    <option value=''>No dropdown</option>
                    {lookups.map(lookup => <option key={lookup.id} value={lookup.id}>{lookup.name}</option>)}
                  </select>
                </div>

                <label className='flex items-center gap-3 rounded-lg border p-4'>
                  <Switch checked={draft.isVisible} disabled={!fieldsEditable || !selectedForm.canHideFields || !selectedField.can_hide} onCheckedChange={value => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],isVisible:value}}))} />
                  <span className='text-sm font-medium'>Visible</span>
                </label>

                <label className='flex items-center gap-3 rounded-lg border p-4'>
                  <Switch checked={draft.isRequired} disabled={!fieldsEditable || !selectedForm.canChangeRequired || !selectedField.can_change_required} onCheckedChange={value => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],isRequired:value}}))} />
                  <span className='text-sm font-medium'>Required</span>
                </label>
              </CardContent>
            </Card>
          )
        })() : null}
      </div>
    </div>
  )
}

export default CompanyFormDesigner
