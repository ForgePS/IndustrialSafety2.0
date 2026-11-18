'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { saveExperienceElement } from './actions'

type Element = {
  id: string
  element_key: string
  element_type: string
  name: string
  default_label: string | null
  default_description: string | null
  category: string
  platform_enabled: boolean
  protection_level: string
  tenant_edit_mode: 'none' | 'content' | 'presentation' | 'full'
  location_edit_mode: 'none' | 'content' | 'presentation' | 'full'
  user_edit_mode: 'none' | 'preference' | 'presentation'
  can_hide: boolean
  can_rename: boolean
  can_reorder: boolean
}

const ExperienceManager = ({ elements }: { elements: Element[] }) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedId, setSelectedId] = useState(elements[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<string, Element>>(Object.fromEntries(elements.map(item => [item.id, item])))

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(elements.map(item => item.category))).sort()],
    [elements]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return elements.filter(item => {
      const matches =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.element_key.toLowerCase().includes(q) ||
        item.element_type.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      return matches && (category === 'all' || item.category === category)
    })
  }, [category, elements, search])

  const selected = drafts[selectedId]

  const save = () => {
    if (!selected) return

    startTransition(async () => {
      const result = await saveExperienceElement({
        elementId: selected.id,
        name: selected.name,
        defaultLabel: selected.default_label || '',
        defaultDescription: selected.default_description || '',
        category: selected.category,
        platformEnabled: selected.platform_enabled,
        tenantEditMode: selected.tenant_edit_mode,
        locationEditMode: selected.location_edit_mode,
        userEditMode: selected.user_edit_mode,
        canHide: selected.can_hide,
        canRename: selected.can_rename,
        canReorder: selected.can_reorder
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save experience element.')
        return
      }

      toast('success', result.message)
    })
  }

  if (!elements.length) {
    return <Card><CardContent className='p-6'>No experience elements are registered yet.</CardContent></Card>
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='grid gap-3 p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search editable elements...' className='pl-10' />
            </div>
            <select value={category} onChange={e => setCategory(e.target.value)} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
              {categories.map(item => <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>)}
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-4'>
            {filtered.map(item => (
              <button
                type='button'
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`rounded-lg border p-3 text-left transition ${selectedId === item.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-textPrimary font-semibold'>{item.name}</span>
                  <Badge size='sm' variant='outline'>{item.element_type}</Badge>
                </div>
                <div className='text-textSecondary mt-1 text-xs'>{item.element_key}</div>
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
                  <CardDescription>{selected.element_key}</CardDescription>
                </div>
                <div className='flex gap-2'>
                  <Badge size='sm' variant='outline'>{selected.protection_level}</Badge>
                  <Badge size='sm' variant={selected.platform_enabled ? 'tonalSuccess' : 'secondary'}>
                    {selected.platform_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className='grid gap-5 md:grid-cols-2'>
              <div>
                <Label>Name</Label>
                <Input className='mt-2' value={selected.name} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],name:e.target.value}}))} />
              </div>
              <div>
                <Label>Default Label</Label>
                <Input className='mt-2' value={selected.default_label || ''} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],default_label:e.target.value}}))} />
              </div>
              <div className='md:col-span-2'>
                <Label>Description / Help Text</Label>
                <Textarea className='mt-2' rows={3} value={selected.default_description || ''} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],default_description:e.target.value}}))} />
              </div>
              <div>
                <Label>Category</Label>
                <Input className='mt-2' value={selected.category} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],category:e.target.value}}))} />
              </div>
              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch checked={selected.platform_enabled} onCheckedChange={v => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],platform_enabled:v}}))} />
                <span>
                  <span className='text-textPrimary block text-sm font-medium'>Platform Enabled</span>
                  <span className='text-textSecondary block text-xs'>Turn this experience element on or off globally.</span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who Can Customize It?</CardTitle>
              <CardDescription>Creator controls which layers may modify this element.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-5 lg:grid-cols-3'>
              <div>
                <Label>Tenant Admin</Label>
                <select value={selected.tenant_edit_mode} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],tenant_edit_mode:e.target.value as Element['tenant_edit_mode']}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  <option value='none'>No Editing</option>
                  <option value='content'>Content Only</option>
                  <option value='presentation'>Presentation</option>
                  <option value='full'>Full Allowed Customization</option>
                </select>
              </div>
              <div>
                <Label>Location Admin</Label>
                <select value={selected.location_edit_mode} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],location_edit_mode:e.target.value as Element['location_edit_mode']}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  <option value='none'>No Editing</option>
                  <option value='content'>Content Only</option>
                  <option value='presentation'>Presentation</option>
                  <option value='full'>Full Allowed Customization</option>
                </select>
              </div>
              <div>
                <Label>User</Label>
                <select value={selected.user_edit_mode} onChange={e => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],user_edit_mode:e.target.value as Element['user_edit_mode']}}))} className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'>
                  <option value='none'>No Editing</option>
                  <option value='preference'>Preferences Only</option>
                  <option value='presentation'>Presentation</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Editable Behaviors</CardTitle>
              <CardDescription>Keep core keys stable while making the visible experience flexible.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-3'>
              {[
                ['can_rename','Allow Rename'],
                ['can_hide','Allow Hide / Show'],
                ['can_reorder','Allow Reorder']
              ].map(([key,label]) => (
                <label key={key} className='flex items-center gap-3 rounded-lg border p-4'>
                  <Switch
                    checked={Boolean(selected[key as keyof Element])}
                    onCheckedChange={v => setDrafts(c => ({...c,[selected.id]:{...c[selected.id],[key]:v}}))}
                  />
                  <span className='text-sm font-medium'>{label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <div className='sticky bottom-4 flex justify-end'>
            <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save Experience Settings'}</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ExperienceManager
