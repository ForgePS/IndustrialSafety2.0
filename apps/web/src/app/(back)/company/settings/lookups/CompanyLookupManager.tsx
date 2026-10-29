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
  deleteCompanyCustomLookupOption,
  saveCompanyLookupOption,
  saveCompanyLookupPresentation
} from './actions'

type Option = {
  id: string
  tenantOptionId: string | null
  optionKey: string
  label: string
  sortOrder: number
  isActive: boolean
  isCustom: boolean
}

type Lookup = {
  id: string
  lookup_key: string
  name: string
  description: string | null
  category: string
  canRename: boolean
  canReorder: boolean
  canAddOptions: boolean
  canHideCoreOptions: boolean
  effectiveLabel: string
  effectiveDescription: string
  options: Option[]
}

const CompanyLookupManager = ({ lookups }: { lookups: Lookup[] }) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(lookups[0]?.id ?? '')
  const selected = lookups.find(item => item.id === selectedId) || lookups[0]

  const [lookupDrafts, setLookupDrafts] = useState<Record<string, { label: string; description: string }>>(
    Object.fromEntries(lookups.map(item => [item.id, { label: item.effectiveLabel, description: item.effectiveDescription }]))
  )

  const [optionDrafts, setOptionDrafts] = useState<Record<string, Option[]>>(
    Object.fromEntries(lookups.map(item => [item.id, item.options]))
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lookups.filter(item =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.lookup_key.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    )
  }, [lookups, search])

  const savePresentation = () => {
    if (!selected) return
    const draft = lookupDrafts[selected.id]

    startTransition(async () => {
      const result = await saveCompanyLookupPresentation({
        lookupId: selected.id,
        label: draft.label,
        description: draft.description
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save dropdown settings.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveOption = (option: Option) => {
    if (!selected) return

    startTransition(async () => {
      const result = await saveCompanyLookupOption({
        lookupId: selected.id,
        tenantOptionId: option.tenantOptionId,
        baseOptionId: option.isCustom ? null : option.id,
        customOptionKey: option.isCustom ? option.optionKey : null,
        label: option.label,
        sortOrder: option.sortOrder,
        isActive: option.isActive,
        isCustom: option.isCustom
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save option.')
        return
      }

      if ('id' in result && result.id && !option.tenantOptionId) {
        setOptionDrafts(current => ({
          ...current,
          [selected.id]: current[selected.id].map(item =>
            item.id === option.id ? { ...item, tenantOptionId: result.id } : item
          )
        }))
      }

      toast('success', result.message)
    })
  }

  const addOption = () => {
    if (!selected?.canAddOptions) return
    const label = window.prompt('New option label')
    if (!label) return

    const key = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const option: Option = {
      id: `temp-${Date.now()}`,
      tenantOptionId: null,
      optionKey: key,
      label,
      sortOrder: (optionDrafts[selected.id]?.length || 0) * 10 + 10,
      isActive: true,
      isCustom: true
    }

    setOptionDrafts(current => ({
      ...current,
      [selected.id]: [...(current[selected.id] || []), option]
    }))
  }

  const removeOption = (option: Option) => {
    if (!selected || !option.isCustom) return

    if (!option.tenantOptionId) {
      setOptionDrafts(current => ({
        ...current,
        [selected.id]: current[selected.id].filter(item => item.id !== option.id)
      }))
      return
    }

    if (!window.confirm(`Delete ${option.label}?`)) return

    startTransition(async () => {
      const result = await deleteCompanyCustomLookupOption({
        lookupId: selected.id,
        optionId: option.tenantOptionId as string
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to delete option.')
        return
      }

      setOptionDrafts(current => ({
        ...current,
        [selected.id]: current[selected.id].filter(item => item.id !== option.id)
      }))

      toast('success', result.message)
    })
  }

  if (!lookups.length) return <Card><CardContent className='p-6'>No editable dropdowns are available.</CardContent></Card>

  return (
    <div className='grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search dropdowns...' className='pl-10' />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='flex max-h-[72vh] flex-col gap-2 overflow-y-auto p-4'>
            {filtered.map(item => (
              <button
                key={item.id}
                type='button'
                onClick={() => setSelectedId(item.id)}
                className={`rounded-lg border p-3 text-left ${selected?.id === item.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'}`}
              >
                <div className='text-textPrimary font-semibold'>{item.effectiveLabel}</div>
                <div className='text-textSecondary mt-1 text-xs'>{item.lookup_key}</div>
                <div className='text-textSecondary mt-1 text-xs'>{item.category}</div>
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
                  <CardTitle>{selected.effectiveLabel}</CardTitle>
                  <CardDescription>{selected.lookup_key}</CardDescription>
                </div>
                {selected.canRename ? (
                  <Button onClick={savePresentation} disabled={pending}>Save Dropdown</Button>
                ) : <Badge variant='secondary'>Name locked by Forge</Badge>}
              </div>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div>
                <Label>Dropdown Label</Label>
                <Input
                  className='mt-2'
                  disabled={!selected.canRename}
                  value={lookupDrafts[selected.id].label}
                  onChange={event => setLookupDrafts(current => ({
                    ...current,
                    [selected.id]: { ...current[selected.id], label: event.target.value }
                  }))}
                />
              </div>
              <div className='md:col-span-2'>
                <Label>Description / Help Text</Label>
                <Textarea
                  className='mt-2'
                  rows={2}
                  disabled={!selected.canRename}
                  value={lookupDrafts[selected.id].description}
                  onChange={event => setLookupDrafts(current => ({
                    ...current,
                    [selected.id]: { ...current[selected.id], description: event.target.value }
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <CardTitle>Options</CardTitle>
                  <CardDescription>System keys stay fixed while approved labels and order can be customized.</CardDescription>
                </div>
                {selected.canAddOptions ? (
                  <Button variant='outline' onClick={addOption}><TbPlus />Add Option</Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className='divide-y'>
              {(optionDrafts[selected.id] || []).map(option => (
                <div key={option.id} className='grid gap-4 py-4 lg:grid-cols-[180px_minmax(0,1fr)_120px_120px_auto] lg:items-end'>
                  <div>
                    <Label>System Key</Label>
                    <Input className='mt-2' value={option.optionKey} disabled />
                  </div>

                  <div>
                    <Label>Visible Label</Label>
                    <Input
                      className='mt-2'
                      disabled={!selected.canRename}
                      value={option.label}
                      onChange={event => setOptionDrafts(current => ({
                        ...current,
                        [selected.id]: current[selected.id].map(item =>
                          item.id === option.id ? { ...item, label: event.target.value } : item
                        )
                      }))}
                    />
                  </div>

                  <div>
                    <Label>Order</Label>
                    <Input
                      className='mt-2'
                      type='number'
                      disabled={!selected.canReorder}
                      value={option.sortOrder}
                      onChange={event => setOptionDrafts(current => ({
                        ...current,
                        [selected.id]: current[selected.id].map(item =>
                          item.id === option.id ? { ...item, sortOrder: Number(event.target.value) } : item
                        )
                      }))}
                    />
                  </div>

                  <label className='flex h-[38px] items-center gap-2'>
                    <Switch
                      checked={option.isActive}
                      disabled={!option.isCustom && !selected.canHideCoreOptions}
                      onCheckedChange={value => setOptionDrafts(current => ({
                        ...current,
                        [selected.id]: current[selected.id].map(item =>
                          item.id === option.id ? { ...item, isActive: value } : item
                        )
                      }))}
                    />
                    <span className='text-sm'>Active</span>
                  </label>

                  <div className='flex gap-2'>
                    <Button size='sm' variant='outline' onClick={() => saveOption(option)} disabled={pending}>Save</Button>
                    {option.isCustom ? (
                      <Button size='sm' variant='destructive' onClick={() => removeOption(option)} disabled={pending}><TbTrash /></Button>
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

export default CompanyLookupManager
