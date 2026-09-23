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
import { resetTenantExperienceOverride, saveTenantExperienceOverride } from './actions'

type Item = {
  id: string
  element_key: string
  element_type: string
  name: string
  default_label: string | null
  default_description: string | null
  category: string
  sort_order: number
  tenant_edit_mode: 'none' | 'content' | 'presentation' | 'full'
  can_hide: boolean
  can_rename: boolean
  can_reorder: boolean
  override: {
    label: string | null
    description: string | null
    hidden: boolean | null
    sort_order: number | null
  } | null
}

type Draft = {
  label: string
  description: string
  hidden: boolean
  sortOrder: number
}

const CompanyExperienceManager = ({ items }: { items: Item[] }) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(
      items.map(item => [
        item.id,
        {
          label: item.override?.label ?? item.default_label ?? item.name,
          description: item.override?.description ?? item.default_description ?? '',
          hidden: item.override?.hidden ?? false,
          sortOrder: item.override?.sort_order ?? item.sort_order
        }
      ])
    )
  )

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(items.map(item => item.category))).sort()],
    [items]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return items.filter(item => {
      const matches =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.element_key.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)

      return matches && (category === 'all' || item.category === category)
    })
  }, [category, items, search])

  const save = (item: Item) => {
    const draft = drafts[item.id]

    startTransition(async () => {
      const result = await saveTenantExperienceOverride({
        elementId: item.id,
        label: draft.label,
        description: draft.description,
        hidden: item.can_hide ? draft.hidden : null,
        sortOrder: item.can_reorder ? draft.sortOrder : null
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save customization.')
        return
      }

      toast('success', result.message)
    })
  }

  const reset = (item: Item) => {
    startTransition(async () => {
      const result = await resetTenantExperienceOverride(item.id)

      if ('error' in result) {
        toast('error', result.error || 'Unable to reset customization.')
        return
      }

      setDrafts(current => ({
        ...current,
        [item.id]: {
          label: item.default_label || item.name,
          description: item.default_description || '',
          hidden: false,
          sortOrder: item.sort_order
        }
      }))

      toast('success', result.message)
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_240px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search company customization...' className='pl-10' />
          </div>
          <select value={category} onChange={event => setCategory(event.target.value)} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
            {categories.map(item => <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>)}
          </select>
        </CardContent>
      </Card>

      {filtered.map(item => {
        const draft = drafts[item.id]
        const contentEditable = ['content', 'full'].includes(item.tenant_edit_mode)

        return (
          <Card key={item.id}>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <CardTitle>{item.name}</CardTitle>
                    <Badge size='sm' variant='outline'>{item.element_type}</Badge>
                    <Badge size='sm' variant='secondary'>{item.tenant_edit_mode}</Badge>
                  </div>
                  <CardDescription className='mt-2'>{item.element_key}</CardDescription>
                </div>
                <div className='flex gap-2'>
                  <Button variant='outline' onClick={() => reset(item)} disabled={pending}>
                    <TbRefresh />
                    Reset
                  </Button>
                  <Button onClick={() => save(item)} disabled={pending}>Save</Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className='grid gap-5 lg:grid-cols-2'>
              <div>
                <Label>Visible Label</Label>
                <Input
                  className='mt-2'
                  value={draft.label}
                  disabled={!item.can_rename}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [item.id]: { ...current[item.id], label: event.target.value }
                  }))}
                />
                {!item.can_rename ? <div className='text-textSecondary mt-1 text-xs'>Forge has locked this label.</div> : null}
              </div>

              <div>
                <Label>Display Order</Label>
                <Input
                  className='mt-2'
                  type='number'
                  value={draft.sortOrder}
                  disabled={!item.can_reorder}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [item.id]: { ...current[item.id], sortOrder: Number(event.target.value) }
                  }))}
                />
              </div>

              <div className='lg:col-span-2'>
                <Label>Description / Help Text</Label>
                <Textarea
                  className='mt-2'
                  rows={3}
                  value={draft.description}
                  disabled={!contentEditable}
                  onChange={event => setDrafts(current => ({
                    ...current,
                    [item.id]: { ...current[item.id], description: event.target.value }
                  }))}
                />
              </div>

              <label className='flex items-center gap-3 rounded-lg border p-4'>
                <Switch
                  checked={!draft.hidden}
                  disabled={!item.can_hide}
                  onCheckedChange={visible => setDrafts(current => ({
                    ...current,
                    [item.id]: { ...current[item.id], hidden: !visible }
                  }))}
                />
                <span className='flex items-center gap-2'>
                  {draft.hidden ? <TbEyeOff /> : <TbEye />}
                  <span>
                    <span className='text-textPrimary block text-sm font-medium'>{draft.hidden ? 'Hidden' : 'Visible'}</span>
                    <span className='text-textSecondary block text-xs'>Show or hide this item for the company.</span>
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default CompanyExperienceManager
