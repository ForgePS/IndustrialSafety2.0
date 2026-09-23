'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbPlus, TbSearch, TbTrash } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { deleteInspectionTemplateItem, saveInspectionTemplate, saveInspectionTemplateItem } from './actions'

type TemplateItem = {
  id: string
  item_key: string
  section_key: string
  section_label: string
  prompt: string
  guidance: string | null
  response_type: 'pass_fail_na' | 'yes_no_na' | 'text' | 'number'
  sort_order: number
  is_required: boolean
  finding_on: string[]
}

type Template = {
  id: string
  name: string
  description: string | null
  inspection_type: string
  version: number
  is_active: boolean
  items: TemplateItem[]
}

type LookupOption = { key: string; label: string }

const TemplateManager = ({
  templates,
  typeOptions
}: {
  templates: Template[]
  typeOptions: LookupOption[]
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '')
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, any>>(
    Object.fromEntries(templates.map(template => [
      template.id,
      {
        name: template.name,
        description: template.description || '',
        inspectionType: template.inspection_type,
        isActive: template.is_active
      }
    ]))
  )
  const [itemDrafts, setItemDrafts] = useState<Record<string, any>>(
    Object.fromEntries(templates.flatMap(template => template.items.map(item => [
      item.id,
      {
        itemKey: item.item_key,
        sectionKey: item.section_key,
        sectionLabel: item.section_label,
        prompt: item.prompt,
        guidance: item.guidance || '',
        responseType: item.response_type,
        sortOrder: item.sort_order,
        isRequired: item.is_required,
        findingOn: item.finding_on || []
      }
    ])))
  )
  const [newTemplate, setNewTemplate] = useState(false)
  const [newItem, setNewItem] = useState(false)
  const [newTemplateDraft, setNewTemplateDraft] = useState({
    name: '',
    description: '',
    inspectionType: typeOptions[0]?.key || 'general',
    isActive: true
  })
  const [newItemDraft, setNewItemDraft] = useState({
    itemKey: '',
    sectionKey: 'general',
    sectionLabel: 'General',
    prompt: '',
    guidance: '',
    responseType: 'pass_fail_na' as 'pass_fail_na' | 'yes_no_na' | 'text' | 'number',
    sortOrder: 10,
    isRequired: true,
    findingOn: ['fail']
  })

  const selected = templates.find(item => item.id === selectedId) || templates[0]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter(template =>
      !q ||
      template.name.toLowerCase().includes(q) ||
      template.inspection_type.toLowerCase().includes(q)
    )
  }, [templates, search])

  const saveTemplate = (template: Template) => {
    const draft = templateDrafts[template.id]
    startTransition(async () => {
      const result = await saveInspectionTemplate({
        templateId: template.id,
        name: draft.name,
        description: draft.description,
        inspectionType: draft.inspectionType,
        isActive: draft.isActive
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save template.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const createTemplate = () => {
    startTransition(async () => {
      const result = await saveInspectionTemplate({
        templateId: null,
        name: newTemplateDraft.name,
        description: newTemplateDraft.description,
        inspectionType: newTemplateDraft.inspectionType,
        isActive: newTemplateDraft.isActive
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to create template.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const saveItem = (item: TemplateItem) => {
    if (!selected) return
    const draft = itemDrafts[item.id]

    startTransition(async () => {
      const result = await saveInspectionTemplateItem({
        templateId: selected.id,
        itemId: item.id,
        itemKey: draft.itemKey,
        sectionKey: draft.sectionKey,
        sectionLabel: draft.sectionLabel,
        prompt: draft.prompt,
        guidance: draft.guidance,
        responseType: draft.responseType,
        sortOrder: Number(draft.sortOrder),
        isRequired: Boolean(draft.isRequired),
        findingOn: draft.findingOn
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save checklist item.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const createItem = () => {
    if (!selected) return
    startTransition(async () => {
      const result = await saveInspectionTemplateItem({
        templateId: selected.id,
        itemId: null,
        itemKey: newItemDraft.itemKey,
        sectionKey: newItemDraft.sectionKey,
        sectionLabel: newItemDraft.sectionLabel,
        prompt: newItemDraft.prompt,
        guidance: newItemDraft.guidance,
        responseType: newItemDraft.responseType,
        sortOrder: Number(newItemDraft.sortOrder),
        isRequired: Boolean(newItemDraft.isRequired),
        findingOn: newItemDraft.findingOn
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to add checklist item.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const removeItem = (item: TemplateItem) => {
    if (!selected || !window.confirm('Delete this checklist item from the template? Existing inspections keep their snapshot.')) return

    startTransition(async () => {
      const result = await deleteInspectionTemplateItem({
        templateId: selected.id,
        itemId: item.id
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to delete checklist item.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search templates...' className='pl-10' />
            </div>
            <Button className='mt-3 w-full' variant='outline' onClick={() => setNewTemplate(value => !value)}>
              <TbPlus />
              New Template
            </Button>
          </CardContent>
        </Card>

        {newTemplate ? (
          <Card>
            <CardHeader>
              <CardTitle>New Template</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <div>
                <Label>Name</Label>
                <Input className='mt-2' value={newTemplateDraft.name} onChange={event => setNewTemplateDraft(current => ({ ...current, name: event.target.value }))} />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  value={newTemplateDraft.inspectionType}
                  onChange={event => setNewTemplateDraft(current => ({ ...current, inspectionType: event.target.value }))}
                >
                  {typeOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea className='mt-2' rows={3} value={newTemplateDraft.description} onChange={event => setNewTemplateDraft(current => ({ ...current, description: event.target.value }))} />
              </div>
              <Button onClick={createTemplate} disabled={pending || !newTemplateDraft.name.trim()}>Create Template</Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className='flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-4'>
            {filtered.map(template => (
              <button
                key={template.id}
                type='button'
                onClick={() => setSelectedId(template.id)}
                className={\`rounded-lg border p-3 text-left \${selected?.id === template.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}\`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-semibold'>{template.name}</span>
                  <Badge size='sm' variant={template.is_active ? 'tonalSuccess' : 'secondary'}>v{template.version}</Badge>
                </div>
                <div className='text-textSecondary mt-1 text-xs'>{template.inspection_type}</div>
                <div className='text-textSecondary mt-1 text-xs'>{template.items.length} checklist item(s)</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {selected ? (
        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <CardTitle>{selected.name}</CardTitle>
                  <CardDescription>Template version {selected.version}</CardDescription>
                </div>
                <Button onClick={() => saveTemplate(selected)} disabled={pending}>Save Template</Button>
              </div>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div>
                <Label>Name</Label>
                <Input className='mt-2' value={templateDrafts[selected.id].name} onChange={event => setTemplateDrafts(current => ({ ...current, [selected.id]: { ...current[selected.id], name: event.target.value } }))} />
              </div>
              <div>
                <Label>Inspection Type</Label>
                <select
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  value={templateDrafts[selected.id].inspectionType}
                  onChange={event => setTemplateDrafts(current => ({ ...current, [selected.id]: { ...current[selected.id], inspectionType: event.target.value } }))}
                >
                  {typeOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </div>
              <div className='md:col-span-2'>
                <Label>Description</Label>
                <Textarea className='mt-2' rows={3} value={templateDrafts[selected.id].description} onChange={event => setTemplateDrafts(current => ({ ...current, [selected.id]: { ...current[selected.id], description: event.target.value } }))} />
              </div>
              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch checked={templateDrafts[selected.id].isActive} onCheckedChange={value => setTemplateDrafts(current => ({ ...current, [selected.id]: { ...current[selected.id], isActive: value } }))} />
                <span className='font-medium'>Active Template</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <CardTitle>Checklist Items</CardTitle>
                  <CardDescription>Existing inspections keep a snapshot when the template later changes.</CardDescription>
                </div>
                <Button variant='outline' onClick={() => setNewItem(value => !value)}><TbPlus />Add Item</Button>
              </div>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {newItem ? (
                <div className='rounded-lg border p-4'>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <div>
                      <Label>Item Key</Label>
                      <Input className='mt-2' value={newItemDraft.itemKey} onChange={event => setNewItemDraft(current => ({ ...current, itemKey: event.target.value }))} placeholder='exits_clear' />
                    </div>
                    <div>
                      <Label>Section</Label>
                      <Input className='mt-2' value={newItemDraft.sectionLabel} onChange={event => setNewItemDraft(current => ({ ...current, sectionLabel: event.target.value, sectionKey: event.target.value }))} />
                    </div>
                    <div className='md:col-span-2'>
                      <Label>Prompt</Label>
                      <Input className='mt-2' value={newItemDraft.prompt} onChange={event => setNewItemDraft(current => ({ ...current, prompt: event.target.value }))} />
                    </div>
                    <div className='md:col-span-2'>
                      <Label>Guidance</Label>
                      <Textarea className='mt-2' rows={2} value={newItemDraft.guidance} onChange={event => setNewItemDraft(current => ({ ...current, guidance: event.target.value }))} />
                    </div>
                    <div>
                      <Label>Response Type</Label>
                      <select className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3' value={newItemDraft.responseType} onChange={event => setNewItemDraft(current => ({ ...current, responseType: event.target.value as any }))}>
                        <option value='pass_fail_na'>Pass / Fail / N/A</option>
                        <option value='yes_no_na'>Yes / No / N/A</option>
                        <option value='text'>Text</option>
                        <option value='number'>Number</option>
                      </select>
                    </div>
                    <div>
                      <Label>Order</Label>
                      <Input className='mt-2' type='number' value={newItemDraft.sortOrder} onChange={event => setNewItemDraft(current => ({ ...current, sortOrder: Number(event.target.value) }))} />
                    </div>
                    <label className='flex items-center gap-3 rounded-lg border p-4'>
                      <Switch checked={newItemDraft.isRequired} onCheckedChange={value => setNewItemDraft(current => ({ ...current, isRequired: value }))} />
                      <span className='font-medium'>Required</span>
                    </label>
                    <label className='flex items-center gap-3 rounded-lg border p-4'>
                      <Switch
  checked={newItemDraft.findingOn.includes(newItemDraft.responseType === 'yes_no_na' ? 'no' : 'fail')}
  onCheckedChange={value => setNewItemDraft(current => ({
    ...current,
    findingOn: value ? [current.responseType === 'yes_no_na' ? 'no' : 'fail'] : []
  }))}
/>
                      <span className='font-medium'>Flag Finding on Fail</span>
                    </label>
                  </div>
                  <div className='mt-4 flex gap-2'>
                    <Button onClick={createItem} disabled={pending || !newItemDraft.prompt.trim() || !newItemDraft.itemKey.trim()}>Add Checklist Item</Button>
                    <Button variant='outline' onClick={() => setNewItem(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}

              {selected.items.slice().sort((a,b) => a.sort_order - b.sort_order).map(item => {
                const draft = itemDrafts[item.id]
                return (
                  <div key={item.id} className='rounded-lg border p-4'>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div>
                        <Label>Item Key</Label>
                        <Input className='mt-2' value={draft.itemKey} onChange={event => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], itemKey: event.target.value } }))} />
                      </div>
                      <div>
                        <Label>Section</Label>
                        <Input className='mt-2' value={draft.sectionLabel} onChange={event => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], sectionLabel: event.target.value, sectionKey: event.target.value } }))} />
                      </div>
                      <div className='md:col-span-2'>
                        <Label>Prompt</Label>
                        <Input className='mt-2' value={draft.prompt} onChange={event => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], prompt: event.target.value } }))} />
                      </div>
                      <div className='md:col-span-2'>
                        <Label>Guidance</Label>
                        <Textarea className='mt-2' rows={2} value={draft.guidance} onChange={event => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], guidance: event.target.value } }))} />
                      </div>
                      <div>
                        <Label>Response Type</Label>
                        <select className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3' value={draft.responseType} onChange={event => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], responseType: event.target.value } }))}>
                          <option value='pass_fail_na'>Pass / Fail / N/A</option>
                          <option value='yes_no_na'>Yes / No / N/A</option>
                          <option value='text'>Text</option>
                          <option value='number'>Number</option>
                        </select>
                      </div>
                      <div>
                        <Label>Order</Label>
                        <Input className='mt-2' type='number' value={draft.sortOrder} onChange={event => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], sortOrder: Number(event.target.value) } }))} />
                      </div>
                      <label className='flex items-center gap-3 rounded-lg border p-4'>
                        <Switch checked={draft.isRequired} onCheckedChange={value => setItemDrafts(current => ({ ...current, [item.id]: { ...current[item.id], isRequired: value } }))} />
                        <span className='font-medium'>Required</span>
                      </label>
                      <label className='flex items-center gap-3 rounded-lg border p-4'>
                        <Switch
  checked={draft.findingOn.includes(draft.responseType === 'yes_no_na' ? 'no' : 'fail')}
  onCheckedChange={value => setItemDrafts(current => ({
    ...current,
    [item.id]: {
      ...current[item.id],
      findingOn: value ? [current[item.id].responseType === 'yes_no_na' ? 'no' : 'fail'] : []
    }
  }))}
/>
                        <span className='font-medium'>Flag Finding on Fail</span>
                      </label>
                    </div>
                    <div className='mt-4 flex gap-2'>
                      <Button variant='outline' onClick={() => saveItem(item)} disabled={pending}>Save Item</Button>
                      <Button variant='destructive' onClick={() => removeItem(item)} disabled={pending}><TbTrash />Delete</Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card><CardContent className='p-6'>Create or select an inspection template.</CardContent></Card>
      )}
    </div>
  )
}

export default TemplateManager
