'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbEye, TbEyeOff, TbRefresh, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  resetCreatorTenantForm,
  saveCreatorTenantFormField,
  saveCreatorTenantFormPolicy
} from './actions'

type Lookup = { id: string; lookup_key: string; name: string }

type Field = {
  id: string
  field_key: string
  label: string
  help_text: string | null
  placeholder: string | null
  field_type: string
  lookup_id: string | null
  section_key: string
  section_label: string
  sort_order: number
  width: 'quarter' | 'third' | 'half' | 'two_thirds' | 'three_quarters' | 'full'
  is_required: boolean
  is_visible: boolean
  is_read_only: boolean
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
  category: string
  form_type: string
  submit_label: string
  cancel_label: string
  tenant_edit_mode: 'none' | 'presentation' | 'fields' | 'full'
  tenant_can_add_fields: boolean
  tenant_can_hide_fields: boolean
  tenant_can_reorder_fields: boolean
  tenant_can_change_required: boolean
  tenant_can_change_input_type: boolean
  tenant_can_change_lookup: boolean
  override: any | null
  fields: Field[]
}

const boolMode = (value: boolean | null | undefined, base: boolean) =>
  value == null ? (base ? 'inherit-allow' : 'inherit-lock') : value ? 'allow' : 'lock'

const TenantFormBuilder = ({
  organizationId,
  forms,
  lookups
}: {
  organizationId: string
  forms: Form[]
  lookups: Lookup[]
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
        cancelLabel: form.override?.cancel_label ?? form.cancel_label,
        tenantEditModeOverride: form.override?.tenant_edit_mode_override ?? null,
        tenantCanAddFieldsOverride: form.override?.tenant_can_add_fields_override ?? null,
        tenantCanHideFieldsOverride: form.override?.tenant_can_hide_fields_override ?? null,
        tenantCanReorderFieldsOverride: form.override?.tenant_can_reorder_fields_override ?? null,
        tenantCanChangeRequiredOverride: form.override?.tenant_can_change_required_override ?? null,
        tenantCanChangeInputTypeOverride: form.override?.tenant_can_change_input_type_override ?? null,
        tenantCanChangeLookupOverride: form.override?.tenant_can_change_lookup_override ?? null
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
        sectionKey: field.override?.section_key ?? field.section_key,
        sectionLabel: field.override?.section_label ?? field.section_label,
        sortOrder: field.override?.sort_order ?? field.sort_order,
        width: field.override?.width ?? field.width,
        isRequired: field.override?.is_required ?? field.is_required,
        isVisible: field.override?.is_visible ?? field.is_visible,
        isReadOnly: field.override?.is_read_only ?? field.is_read_only
      }
    ])))
  )

  const filteredForms = useMemo(() => {
    const q = search.trim().toLowerCase()
    return forms.filter(form =>
      !q ||
      form.name.toLowerCase().includes(q) ||
      form.form_key.toLowerCase().includes(q) ||
      form.category.toLowerCase().includes(q)
    )
  }, [forms, search])

  const selectForm = (form: Form) => {
    setSelectedFormId(form.id)
    setSelectedFieldId(form.fields[0]?.id ?? '')
  }

  const saveForm = () => {
    if (!selectedForm) return
    const draft = formDrafts[selectedForm.id]

    startTransition(async () => {
      const result = await saveCreatorTenantFormPolicy({
        organizationId,
        formId: selectedForm.id,
        name: draft.name,
        description: draft.description,
        submitLabel: draft.submitLabel,
        cancelLabel: draft.cancelLabel,
        tenantEditModeOverride: draft.tenantEditModeOverride,
        tenantCanAddFieldsOverride: draft.tenantCanAddFieldsOverride,
        tenantCanHideFieldsOverride: draft.tenantCanHideFieldsOverride,
        tenantCanReorderFieldsOverride: draft.tenantCanReorderFieldsOverride,
        tenantCanChangeRequiredOverride: draft.tenantCanChangeRequiredOverride,
        tenantCanChangeInputTypeOverride: draft.tenantCanChangeInputTypeOverride,
        tenantCanChangeLookupOverride: draft.tenantCanChangeLookupOverride
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save form.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveField = () => {
    if (!selectedForm || !selectedField) return
    const draft = fieldDrafts[selectedField.id]

    startTransition(async () => {
      const result = await saveCreatorTenantFormField({
        organizationId,
        formId: selectedForm.id,
        fieldId: selectedField.id,
        label: draft.label,
        helpText: draft.helpText,
        placeholder: draft.placeholder,
        fieldType: draft.fieldType,
        lookupId: draft.lookupId || null,
        sectionKey: draft.sectionKey,
        sectionLabel: draft.sectionLabel,
        sortOrder: Number(draft.sortOrder),
        width: draft.width,
        isRequired: Boolean(draft.isRequired),
        isVisible: Boolean(draft.isVisible),
        isReadOnly: Boolean(draft.isReadOnly)
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save field.')
        return
      }

      toast('success', result.message)
    })
  }

  const resetForm = () => {
    if (!selectedForm) return
    if (!window.confirm(`Reset ${selectedForm.name} and all its tenant field overrides?`)) return

    startTransition(async () => {
      const result = await resetCreatorTenantForm({
        organizationId,
        formId: selectedForm.id
      })

      if ('error' in result) {
        toast('error', String(result.error || 'Unable to reset form.'))
        return
      }

      toast('success', String(result.message || 'Form reset.'))
      window.location.reload()
    })
  }

  if (!forms.length) return <Card><CardContent className='p-6'>No forms are registered yet.</CardContent></Card>

  return (
    <div className='grid gap-6 xl:grid-cols-[300px_320px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search forms...' className='pl-10' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forms</CardTitle>
            <CardDescription>Select a tenant form to customize.</CardDescription>
          </CardHeader>
          <CardContent className='flex max-h-[70vh] flex-col gap-2 overflow-y-auto'>
            {filteredForms.map(form => (
              <button
                type='button'
                key={form.id}
                onClick={() => selectForm(form)}
                className={`rounded-lg border p-3 text-left ${selectedForm?.id === form.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
              >
                <div className='text-textPrimary font-semibold'>{form.name}</div>
                <div className='text-textSecondary mt-1 text-xs'>{form.form_key}</div>
                <div className='text-textSecondary mt-1 text-xs'>{form.category}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
          <CardDescription>{selectedForm?.name}</CardDescription>
        </CardHeader>
        <CardContent className='flex max-h-[76vh] flex-col gap-2 overflow-y-auto'>
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
                    <span className='text-textPrimary font-medium'>{draft.label}</span>
                    {draft.isVisible ? <TbEye /> : <TbEyeOff />}
                  </div>
                  <div className='text-textSecondary mt-1 text-xs'>{field.field_key}</div>
                  <div className='mt-2 flex gap-1.5'>
                    {draft.isRequired ? <Badge size='sm' variant='secondary'>Required</Badge> : null}
                    <Badge size='sm' variant='outline'>{draft.fieldType}</Badge>
                  </div>
                </button>
              )
            })}
        </CardContent>
      </Card>

      <div className='flex flex-col gap-6'>
        {selectedForm ? (
          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <CardTitle>Form Settings</CardTitle>
                  <CardDescription>{selectedForm.form_key}</CardDescription>
                </div>
                <div className='flex gap-2'>
                  <Button variant='outline' onClick={resetForm} disabled={pending}><TbRefresh />Reset Form</Button>
                  <Button onClick={saveForm} disabled={pending}>Save Form</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div>
                <Label>Form Name</Label>
                <Input className='mt-2' value={formDrafts[selectedForm.id].name} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],name:e.target.value}}))} />
              </div>
              <div>
                <Label>Tenant Admin Edit Mode</Label>
                <select value={formDrafts[selectedForm.id].tenantEditModeOverride ?? 'inherit'} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],tenantEditModeOverride:e.target.value === 'inherit' ? null : e.target.value}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  <option value='inherit'>Inherit Platform ({selectedForm.tenant_edit_mode})</option>
                  <option value='none'>No Editing</option>
                  <option value='presentation'>Presentation Only</option>
                  <option value='fields'>Field Configuration</option>
                  <option value='full'>Full Allowed Customization</option>
                </select>
              </div>
              <div className='md:col-span-2'>
                <Label>Description</Label>
                <Textarea className='mt-2' rows={2} value={formDrafts[selectedForm.id].description} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],description:e.target.value}}))} />
              </div>
              <div>
                <Label>Save Button Label</Label>
                <Input className='mt-2' value={formDrafts[selectedForm.id].submitLabel} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],submitLabel:e.target.value}}))} />
              </div>
              <div>
                <Label>Cancel Button Label</Label>
                <Input className='mt-2' value={formDrafts[selectedForm.id].cancelLabel} onChange={e => setFormDrafts(c => ({...c,[selectedForm.id]:{...c[selectedForm.id],cancelLabel:e.target.value}}))} />
              </div>

              {([
                ['tenantCanHideFieldsOverride','Hide Fields',selectedForm.tenant_can_hide_fields],
                ['tenantCanReorderFieldsOverride','Reorder Fields',selectedForm.tenant_can_reorder_fields],
                ['tenantCanChangeRequiredOverride','Change Required',selectedForm.tenant_can_change_required],
                ['tenantCanChangeInputTypeOverride','Change Input Type',selectedForm.tenant_can_change_input_type],
                ['tenantCanChangeLookupOverride','Change Dropdown Source',selectedForm.tenant_can_change_lookup]
              ] as const).map(([key,label,base]) => {
                const val = formDrafts[selectedForm.id][key] as boolean | null
                return (
                  <div key={String(key)} className='rounded-lg border p-3'>
                    <div className='text-sm font-medium'>{label}</div>
                    <select
                      value={val == null ? 'inherit' : val ? 'allow' : 'lock'}
                      onChange={e => setFormDrafts(c => ({
                        ...c,
                        [selectedForm.id]: {
                          ...c[selectedForm.id],
                          [key]: e.target.value === 'inherit' ? null : e.target.value === 'allow'
                        }
                      }))}
                      className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                    >
                      <option value='inherit'>Inherit ({base ? 'Allowed' : 'Locked'})</option>
                      <option value='allow' disabled={!base}>Allow</option>
                      <option value='lock'>Lock</option>
                    </select>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : null}

        {selectedField ? (
          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <CardTitle>Field Settings</CardTitle>
                  <CardDescription>{selectedField.field_key}</CardDescription>
                </div>
                <Button onClick={saveField} disabled={pending}>Save Field</Button>
              </div>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div>
                <Label>Visible Label</Label>
                <Input className='mt-2' value={fieldDrafts[selectedField.id].label} disabled={!selectedField.can_rename} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],label:e.target.value}}))} />
              </div>
              <div>
                <Label>Field Type</Label>
                <select value={fieldDrafts[selectedField.id].fieldType} disabled={!selectedField.can_change_input_type} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],fieldType:e.target.value}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  {['text','textarea','email','phone','number','currency','date','datetime','time','select','multi_select','checkbox','switch','radio','file','photo','signature','person','location','division','asset','vehicle','read_only'].map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div className='md:col-span-2'>
                <Label>Help Text</Label>
                <Textarea className='mt-2' rows={2} value={fieldDrafts[selectedField.id].helpText} disabled={!selectedField.can_change_help} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],helpText:e.target.value}}))} />
              </div>
              <div>
                <Label>Placeholder</Label>
                <Input className='mt-2' value={fieldDrafts[selectedField.id].placeholder} disabled={!selectedField.can_change_placeholder} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],placeholder:e.target.value}}))} />
              </div>
              <div>
                <Label>Dropdown Source</Label>
                <select value={fieldDrafts[selectedField.id].lookupId || ''} disabled={!selectedField.can_change_lookup} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],lookupId:e.target.value || null}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  <option value=''>No dropdown source</option>
                  {lookups.map(lookup => <option key={lookup.id} value={lookup.id}>{lookup.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Section Label</Label>
                <Input className='mt-2' value={fieldDrafts[selectedField.id].sectionLabel} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],sectionLabel:e.target.value}}))} />
              </div>
              <div>
                <Label>Section Key</Label>
                <Input className='mt-2' value={fieldDrafts[selectedField.id].sectionKey} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],sectionKey:e.target.value}}))} />
              </div>
              <div>
                <Label>Order</Label>
                <Input className='mt-2' type='number' value={fieldDrafts[selectedField.id].sortOrder} disabled={!selectedField.can_reorder} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],sortOrder:Number(e.target.value)}}))} />
              </div>
              <div>
                <Label>Width</Label>
                <select value={fieldDrafts[selectedField.id].width} onChange={e => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],width:e.target.value}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  <option value='quarter'>Quarter</option>
                  <option value='third'>Third</option>
                  <option value='half'>Half</option>
                  <option value='two_thirds'>Two Thirds</option>
                  <option value='three_quarters'>Three Quarters</option>
                  <option value='full'>Full</option>
                </select>
              </div>
              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch checked={fieldDrafts[selectedField.id].isVisible} disabled={!selectedField.can_hide} onCheckedChange={value => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],isVisible:value}}))} />
                <span className='text-sm font-medium'>Visible</span>
              </label>
              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch checked={fieldDrafts[selectedField.id].isRequired} disabled={!selectedField.can_change_required} onCheckedChange={value => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],isRequired:value}}))} />
                <span className='text-sm font-medium'>Required</span>
              </label>
              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch checked={fieldDrafts[selectedField.id].isReadOnly} onCheckedChange={value => setFieldDrafts(c => ({...c,[selectedField.id]:{...c[selectedField.id],isReadOnly:value}}))} />
                <span className='text-sm font-medium'>Read Only</span>
              </label>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export default TenantFormBuilder
