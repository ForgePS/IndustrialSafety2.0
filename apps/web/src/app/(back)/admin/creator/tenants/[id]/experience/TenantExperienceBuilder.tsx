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

import { resetCreatorTenantExperience, saveCreatorTenantExperience } from './actions'

type Element = {
  id: string
  element_key: string
  element_type: string
  name: string
  default_label: string | null
  default_description: string | null
  category: string
  sort_order: number
  tenant_edit_mode: 'none' | 'content' | 'presentation' | 'full'
  location_edit_mode: 'none' | 'content' | 'presentation' | 'full'
  user_edit_mode: 'none' | 'preference' | 'presentation'
  can_hide: boolean
  can_rename: boolean
  can_reorder: boolean
  override: {
    label: string | null
    description: string | null
    hidden: boolean | null
    sort_order: number | null
    tenant_edit_mode_override: 'none' | 'content' | 'presentation' | 'full' | null
    location_edit_mode_override: 'none' | 'content' | 'presentation' | 'full' | null
    user_edit_mode_override: 'none' | 'preference' | 'presentation' | null
    can_hide_override: boolean | null
    can_rename_override: boolean | null
    can_reorder_override: boolean | null
  } | null
}

type Draft = {
  label: string
  description: string
  hidden: boolean
  sortOrder: number
  tenantEditModeOverride: Element['tenant_edit_mode'] | null
  locationEditModeOverride: Element['location_edit_mode'] | null
  userEditModeOverride: Element['user_edit_mode'] | null
  canHideOverride: boolean | null
  canRenameOverride: boolean | null
  canReorderOverride: boolean | null
}

const TenantExperienceBuilder = ({
  organizationId,
  elements
}: {
  organizationId: string
  elements: Element[]
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedId, setSelectedId] = useState(elements[0]?.id ?? '')

  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(
      elements.map(element => [
        element.id,
        {
          label: element.override?.label ?? element.default_label ?? element.name,
          description: element.override?.description ?? element.default_description ?? '',
          hidden: element.override?.hidden ?? false,
          sortOrder: element.override?.sort_order ?? element.sort_order,
          tenantEditModeOverride: element.override?.tenant_edit_mode_override ?? null,
          locationEditModeOverride: element.override?.location_edit_mode_override ?? null,
          userEditModeOverride: element.override?.user_edit_mode_override ?? null,
          canHideOverride: element.override?.can_hide_override ?? null,
          canRenameOverride: element.override?.can_rename_override ?? null,
          canReorderOverride: element.override?.can_reorder_override ?? null
        }
      ])
    )
  )

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(elements.map(element => element.category))).sort()],
    [elements]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    
return elements.filter(element => {
      const matches =
        !q ||
        element.name.toLowerCase().includes(q) ||
        element.element_key.toLowerCase().includes(q) ||
        element.element_type.toLowerCase().includes(q) ||
        element.category.toLowerCase().includes(q)

      return matches && (category === 'all' || element.category === category)
    })
  }, [category, elements, search])

  const selected = elements.find(element => element.id === selectedId) || elements[0]
  const draft = selected ? drafts[selected.id] : null

  const save = () => {
    if (!selected || !draft) return

    startTransition(async () => {
      const result = await saveCreatorTenantExperience({
        organizationId,
        elementId: selected.id,
        label: draft.label,
        description: draft.description,
        hidden: draft.hidden,
        sortOrder: draft.sortOrder,
        tenantEditModeOverride: draft.tenantEditModeOverride,
        locationEditModeOverride: draft.locationEditModeOverride,
        userEditModeOverride: draft.userEditModeOverride,
        canHideOverride: draft.canHideOverride,
        canRenameOverride: draft.canRenameOverride,
        canReorderOverride: draft.canReorderOverride
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save tenant experience.')
        
return
      }

      toast('success', result.message)
    })
  }

  const reset = () => {
    if (!selected) return

    startTransition(async () => {
      const result = await resetCreatorTenantExperience({
        organizationId,
        elementId: selected.id
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to reset tenant experience.')
        
return
      }

      setDrafts(current => ({
        ...current,
        [selected.id]: {
          label: selected.default_label || selected.name,
          description: selected.default_description || '',
          hidden: false,
          sortOrder: selected.sort_order,
          tenantEditModeOverride: null,
          locationEditModeOverride: null,
          userEditModeOverride: null,
          canHideOverride: null,
          canRenameOverride: null,
          canReorderOverride: null
        }
      }))

      toast('success', result.message)
    })
  }

  if (!elements.length) {
    return <Card><CardContent className='p-6'>No editable experience elements are registered.</CardContent></Card>
  }

  return (
    <div className='grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='grid gap-3 p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='Search tenant experience...'
                className='pl-10'
              />
            </div>
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
            >
              {categories.map(item => <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>)}
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-4'>
            {filtered.map(element => (
              <button
                key={element.id}
                type='button'
                onClick={() => setSelectedId(element.id)}
                className={`rounded-lg border p-3 text-left transition ${selected?.id === element.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-textPrimary font-semibold'>{element.name}</span>
                  <Badge size='sm' variant='outline'>{element.element_type}</Badge>
                </div>
                <div className='text-textSecondary mt-1 text-xs'>{element.element_key}</div>
                {element.override ? <div className='text-primary mt-1 text-xs font-medium'>Tenant override active</div> : null}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {selected && draft ? (
        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <CardTitle>{selected.name}</CardTitle>
                  <CardDescription>{selected.element_key}</CardDescription>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button variant='outline' onClick={reset} disabled={pending}>
                    <TbRefresh />
                    Reset Tenant
                  </Button>
                  <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save Tenant Experience'}</Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className='grid gap-5 md:grid-cols-2'>
              <div>
                <Label>Tenant Label</Label>
                <Input
                  className='mt-2'
                  value={draft.label}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [selected.id]: { ...current[selected.id], label: event.target.value }
                  }))}
                />
              </div>

              <div>
                <Label>Display Order</Label>
                <Input
                  className='mt-2'
                  type='number'
                  value={draft.sortOrder}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [selected.id]: { ...current[selected.id], sortOrder: Number(event.target.value) }
                  }))}
                />
              </div>

              <div className='md:col-span-2'>
                <Label>Tenant Description / Help Text</Label>
                <Textarea
                  className='mt-2'
                  rows={3}
                  value={draft.description}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [selected.id]: { ...current[selected.id], description: event.target.value }
                  }))}
                />
              </div>

              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch
                  checked={!draft.hidden}
                  onCheckedChange={visible => setDrafts(current => ({
                    ...current,
                    [selected.id]: { ...current[selected.id], hidden: !visible }
                  }))}
                />
                <span className='flex items-center gap-2'>
                  {draft.hidden ? <TbEyeOff /> : <TbEye />}
                  <span>
                    <span className='text-textPrimary block text-sm font-medium'>{draft.hidden ? 'Hidden for this tenant' : 'Visible for this tenant'}</span>
                    <span className='text-textSecondary block text-xs'>Creator-level tenant override.</span>
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What This Tenant May Customize</CardTitle>
              <CardDescription>
                These settings can be more restrictive than the platform default, but never grant capabilities the platform does not support.
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-5 lg:grid-cols-3'>
              <div>
                <Label>Tenant Admin Edit Mode</Label>
                <select
                  value={draft.tenantEditModeOverride ?? 'inherit'}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [selected.id]: {
                      ...current[selected.id],
                      tenantEditModeOverride: event.target.value === 'inherit' ? null : event.target.value as Element['tenant_edit_mode']
                    }
                  }))}
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                >
                  <option value='inherit'>Inherit Platform ({selected.tenant_edit_mode})</option>
                  <option value='none'>No Editing</option>
                  <option value='content'>Content Only</option>
                  <option value='presentation'>Presentation</option>
                  <option value='full'>Full Allowed Customization</option>
                </select>
              </div>

              <div>
                <Label>Location Admin Edit Mode</Label>
                <select
                  value={draft.locationEditModeOverride ?? 'inherit'}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [selected.id]: {
                      ...current[selected.id],
                      locationEditModeOverride: event.target.value === 'inherit' ? null : event.target.value as Element['location_edit_mode']
                    }
                  }))}
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                >
                  <option value='inherit'>Inherit Platform ({selected.location_edit_mode})</option>
                  <option value='none'>No Editing</option>
                  <option value='content'>Content Only</option>
                  <option value='presentation'>Presentation</option>
                  <option value='full'>Full Allowed Customization</option>
                </select>
              </div>

              <div>
                <Label>User Edit Mode</Label>
                <select
                  value={draft.userEditModeOverride ?? 'inherit'}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [selected.id]: {
                      ...current[selected.id],
                      userEditModeOverride: event.target.value === 'inherit' ? null : event.target.value as Element['user_edit_mode']
                    }
                  }))}
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                >
                  <option value='inherit'>Inherit Platform ({selected.user_edit_mode})</option>
                  <option value='none'>No Editing</option>
                  <option value='preference'>Preferences Only</option>
                  <option value='presentation'>Presentation</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tenant Editing Permissions</CardTitle>
              <CardDescription>Choose whether this tenant can rename, hide, or reorder this element.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-3'>
              {([
                ['canRenameOverride','Rename',selected.can_rename],
                ['canHideOverride','Hide / Show',selected.can_hide],
                ['canReorderOverride','Reorder',selected.can_reorder]
              ] as const).map(([key,label,platformAllowed]) => {
                const value = draft[key as keyof Draft] as boolean | null

                
return (
                  <div key={String(key)} className='rounded-lg border p-4'>
                    <div className='text-textPrimary font-medium'>{label}</div>
                    <div className='text-textSecondary mt-1 text-xs'>Platform default: {platformAllowed ? 'Allowed' : 'Locked'}</div>
                    <select
                      value={value === null ? 'inherit' : value ? 'allow' : 'lock'}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [selected.id]: {
                          ...current[selected.id],
                          [key]: event.target.value === 'inherit' ? null : event.target.value === 'allow'
                        }
                      }))}
                      className='border-input bg-card text-textSecondary mt-3 h-[38px] w-full rounded-md border px-3'
                    >
                      <option value='inherit'>Inherit Platform</option>
                      <option value='allow' disabled={!platformAllowed}>Allow Tenant</option>
                      <option value='lock'>Lock Tenant</option>
                    </select>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

export default TenantExperienceBuilder
