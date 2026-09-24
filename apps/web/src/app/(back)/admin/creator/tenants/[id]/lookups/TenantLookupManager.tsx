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
import {
  deleteCreatorTenantCustomLookupOption,
  saveCreatorTenantLookupOption,
  saveCreatorTenantLookupPolicy
} from './actions'

type Option = {
  id: string
  option_key: string | null
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
  is_core: boolean
  is_custom: boolean
  color: string | null
  icon: string | null
  base_option_id?: string | null
  custom_option_key?: string | null
}

type Lookup = {
  id: string
  lookup_key: string
  name: string
  description: string | null
  category: string
  tenant_can_rename: boolean
  tenant_can_reorder: boolean
  tenant_can_add_options: boolean
  tenant_can_hide_core_options: boolean
  tenant_can_delete_core_options: boolean
  override: {
    label: string | null
    description: string | null
    can_rename_override: boolean | null
    can_reorder_override: boolean | null
    can_add_options_override: boolean | null
    can_hide_core_options_override: boolean | null
    can_delete_core_options_override: boolean | null
  } | null
  options: Option[]
}

const stateLabel = (value: boolean | null, platform: boolean) =>
  value === null ? `Inherit (${platform ? 'Allowed' : 'Locked'})` : value ? 'Allowed' : 'Locked'

const TenantLookupManager = ({
  organizationId,
  lookups
}: {
  organizationId: string
  lookups: Lookup[]
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(lookups[0]?.id ?? '')

  const selected = lookups.find(item => item.id === selectedId) || lookups[0]
  const [lookupDrafts, setLookupDrafts] = useState<Record<string, any>>(
    Object.fromEntries(
      lookups.map(lookup => [
        lookup.id,
        {
          label: lookup.override?.label ?? lookup.name,
          description: lookup.override?.description ?? lookup.description ?? '',
          canRenameOverride: lookup.override?.can_rename_override ?? null,
          canReorderOverride: lookup.override?.can_reorder_override ?? null,
          canAddOptionsOverride: lookup.override?.can_add_options_override ?? null,
          canHideCoreOptionsOverride: lookup.override?.can_hide_core_options_override ?? null,
          canDeleteCoreOptionsOverride: lookup.override?.can_delete_core_options_override ?? null
        }
      ])
    )
  )

  const [options, setOptions] = useState<Record<string, Option[]>>(
    Object.fromEntries(lookups.map(lookup => [lookup.id, lookup.options]))
  )

  const filteredLookups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lookups.filter(lookup =>
      !q ||
      lookup.name.toLowerCase().includes(q) ||
      lookup.lookup_key.toLowerCase().includes(q) ||
      lookup.category.toLowerCase().includes(q)
    )
  }, [lookups, search])

  const savePolicy = () => {
    if (!selected) return
    const draft = lookupDrafts[selected.id]

    startTransition(async () => {
      const result = await saveCreatorTenantLookupPolicy({
        organizationId,
        lookupId: selected.id,
        label: draft.label,
        description: draft.description,
        canRenameOverride: draft.canRenameOverride,
        canReorderOverride: draft.canReorderOverride,
        canAddOptionsOverride: draft.canAddOptionsOverride,
        canHideCoreOptionsOverride: draft.canHideCoreOptionsOverride,
        canDeleteCoreOptionsOverride: draft.canDeleteCoreOptionsOverride
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save dropdown policy.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveOption = (lookup: Lookup, option: Option) => {
    startTransition(async () => {
      const result = await saveCreatorTenantLookupOption({
        organizationId,
        lookupId: lookup.id,
        baseOptionId: option.is_custom ? null : option.base_option_id || option.id,
        customOptionKey: option.is_custom ? option.custom_option_key || option.option_key : null,
        label: option.label,
        description: option.description || '',
        sortOrder: option.sort_order,
        isActive: option.is_active,
        isCustom: option.is_custom,
        color: option.color || '',
        icon: option.icon || ''
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save option.')
        return
      }

      toast('success', result.message)
    })
  }

  const addCustomOption = () => {
    if (!selected) return
    const optionKey = window.prompt('Stable option key (letters, numbers, underscore)')
    if (!optionKey) return
    const label = window.prompt('Visible label')
    if (!label) return

    const normalizedKey = optionKey.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
    const newOption: Option = {
      id: `temp-${Date.now()}`,
      option_key: normalizedKey,
      custom_option_key: normalizedKey,
      label,
      description: null,
      sort_order: (options[selected.id]?.length || 0) * 10 + 10,
      is_active: true,
      is_core: false,
      is_custom: true,
      color: null,
      icon: null
    }

    setOptions(current => ({
      ...current,
      [selected.id]: [...(current[selected.id] || []), newOption]
    }))
  }

  const removeCustomOption = (lookup: Lookup, option: Option) => {
    if (option.id.startsWith('temp-')) {
      setOptions(current => ({
        ...current,
        [lookup.id]: current[lookup.id].filter(item => item.id !== option.id)
      }))
      return
    }

    if (!window.confirm(`Delete ${option.label}?`)) return

    startTransition(async () => {
      const result = await deleteCreatorTenantCustomLookupOption({
        organizationId,
        lookupId: lookup.id,
        optionId: option.id
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to delete custom option.')
        return
      }

      setOptions(current => ({
        ...current,
        [lookup.id]: current[lookup.id].filter(item => item.id !== option.id)
      }))

      toast('success', result.message)
    })
  }

  if (!lookups.length) {
    return <Card><CardContent className='p-6'>No dropdown definitions are registered yet.</CardContent></Card>
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search dropdowns...' className='pl-10' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-4'>
            {filteredLookups.map(lookup => (
              <button
                type='button'
                key={lookup.id}
                onClick={() => setSelectedId(lookup.id)}
                className={`rounded-lg border p-3 text-left transition ${selected?.id === lookup.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
              >
                <div className='text-textPrimary font-semibold'>{lookup.name}</div>
                <div className='text-textSecondary mt-1 text-xs'>{lookup.lookup_key}</div>
                <div className='text-textSecondary mt-1 text-xs'>{lookup.category}</div>
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
                  <CardDescription>{selected.lookup_key}</CardDescription>
                </div>
                <Button onClick={savePolicy} disabled={pending}>{pending ? 'Saving...' : 'Save Dropdown Settings'}</Button>
              </div>
            </CardHeader>
            <CardContent className='grid gap-5 md:grid-cols-2'>
              <div>
                <Label>Tenant Label</Label>
                <Input
                  className='mt-2'
                  value={lookupDrafts[selected.id].label}
                  onChange={e => setLookupDrafts(c => ({
                    ...c,
                    [selected.id]: { ...c[selected.id], label: e.target.value }
                  }))}
                />
              </div>
              <div className='md:col-span-2'>
                <Label>Description / Help Text</Label>
                <Textarea
                  className='mt-2'
                  rows={3}
                  value={lookupDrafts[selected.id].description}
                  onChange={e => setLookupDrafts(c => ({
                    ...c,
                    [selected.id]: { ...c[selected.id], description: e.target.value }
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What This Tenant May Edit</CardTitle>
              <CardDescription>Control the tenant administrator experience for this dropdown.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
              {([
                ['canRenameOverride','Rename',selected.tenant_can_rename],
                ['canReorderOverride','Reorder',selected.tenant_can_reorder],
                ['canAddOptionsOverride','Add Options',selected.tenant_can_add_options],
                ['canHideCoreOptionsOverride','Hide Core Options',selected.tenant_can_hide_core_options],
                ['canDeleteCoreOptionsOverride','Delete Core Options',selected.tenant_can_delete_core_options]
              ] as const).map(([key,label,platformAllowed]) => {
                const value = lookupDrafts[selected.id][key] as boolean | null
                return (
                  <div key={String(key)} className='rounded-lg border p-4'>
                    <div className='text-textPrimary text-sm font-medium'>{label}</div>
                    <div className='text-textSecondary mt-1 text-xs'>{stateLabel(value, Boolean(platformAllowed))}</div>
                    <select
                      value={value === null ? 'inherit' : value ? 'allow' : 'lock'}
                      onChange={e => setLookupDrafts(c => ({
                        ...c,
                        [selected.id]: {
                          ...c[selected.id],
                          [key]: e.target.value === 'inherit' ? null : e.target.value === 'allow'
                        }
                      }))}
                      className='border-input bg-card text-textSecondary mt-3 h-[38px] w-full rounded-md border px-3'
                    >
                      <option value='inherit'>Inherit</option>
                      <option value='allow' disabled={!platformAllowed}>Allow</option>
                      <option value='lock'>Lock</option>
                    </select>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <CardTitle>Dropdown Options</CardTitle>
                  <CardDescription>Core system keys stay stable even when the visible label changes.</CardDescription>
                </div>
                <Button variant='outline' onClick={addCustomOption}>
                  <TbPlus />
                  Add Custom Option
                </Button>
              </div>
            </CardHeader>
            <CardContent className='divide-y'>
              {(options[selected.id] || []).map(option => (
                <div key={option.id} className='grid gap-4 py-4 lg:grid-cols-[170px_minmax(0,1fr)_120px_110px_auto] lg:items-end'>
                  <div>
                    <Label>System Key</Label>
                    <Input className='mt-2' value={option.custom_option_key || option.option_key || ''} disabled={!option.is_custom} />
                  </div>
                  <div>
                    <Label>Visible Label</Label>
                    <Input
                      className='mt-2'
                      value={option.label}
                      onChange={e => setOptions(c => ({
                        ...c,
                        [selected.id]: c[selected.id].map(item => item.id === option.id ? { ...item, label: e.target.value } : item)
                      }))}
                    />
                  </div>
                  <div>
                    <Label>Order</Label>
                    <Input
                      className='mt-2'
                      type='number'
                      value={option.sort_order}
                      onChange={e => setOptions(c => ({
                        ...c,
                        [selected.id]: c[selected.id].map(item => item.id === option.id ? { ...item, sort_order: Number(e.target.value) } : item)
                      }))}
                    />
                  </div>
                  <label className='flex h-[38px] items-center gap-2'>
                    <Switch
                      checked={option.is_active}
                      onCheckedChange={value => setOptions(c => ({
                        ...c,
                        [selected.id]: c[selected.id].map(item => item.id === option.id ? { ...item, is_active: value } : item)
                      }))}
                    />
                    <span className='text-sm'>Active</span>
                  </label>
                  <div className='flex gap-2'>
                    <Button size='sm' variant='outline' onClick={() => saveOption(selected, option)} disabled={pending}>Save</Button>
                    {option.is_custom ? (
                      <Button size='sm' variant='destructive' onClick={() => removeCustomOption(selected, option)} disabled={pending}>
                        <TbTrash />
                      </Button>
                    ) : <Badge size='sm' variant='secondary'>Core</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

export default TenantLookupManager
