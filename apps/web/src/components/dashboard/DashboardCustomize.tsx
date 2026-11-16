'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbArrowDown, TbArrowUp, TbLayoutDashboard } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@repo/ui/components/ui/sheet'
import { toast } from '@repo/ui/utils/toast'

import { resetDashboardLayout, saveDashboardLayout } from '@/app/(back)/dashboard/actions'
import { DASHBOARD_SIZE_LABELS, blockDefinition, type DashboardBlockId, type DashboardLayout } from '@/lib/forgeDashboardRules'

const SELECT = 'border-input bg-card h-[34px] rounded-md border px-2 text-sm'

/**
 * 1.0's "Customize dashboard" panel: show or hide each block, move it, pick its size, and choose which modules
 * appear in My Workspace. Saved per user and company. `available` lists the blocks this viewer can see; the
 * others keep their saved place but are not offered.
 */
const DashboardCustomize = ({ layout, available, modules }: { layout: DashboardLayout; available: DashboardBlockId[]; modules: Array<{ key: string; label: string }> }) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(layout)
  const [pending, startTransition] = useTransition()

  const shown = draft.items.filter(item => available.includes(item.id))
  const pinned = draft.pinnedModules

  const update = (id: string, patch: Partial<DashboardLayout['items'][number]>) =>
    setDraft(current => ({ ...current, items: current.items.map(item => (item.id === id ? { ...item, ...patch } : item)) }))

  // Moves past the neighbouring block the viewer can see, so hidden-by-permission blocks never block a move.
  const move = (id: DashboardBlockId, direction: -1 | 1) =>
    setDraft(current => {
      const visibleIds = current.items.filter(item => available.includes(item.id)).map(item => item.id)
      const at = visibleIds.indexOf(id)
      const swapWith = visibleIds[at + direction]

      if (at < 0 || !swapWith) return current

      const items = [...current.items]
      const from = items.findIndex(item => item.id === id)

      const to = items.findIndex(item => item.id === swapWith)

      ;[items[from], items[to]] = [items[to], items[from]]

      return { ...current, items }
    })

  const togglePin = (key: string) =>
    setDraft(current => {
      const list = current.pinnedModules ?? modules.map(item => item.key)
      const next = list.includes(key) ? list.filter(item => item !== key) : [...list, key]

      return { ...current, pinnedModules: next.length === modules.length ? null : next }
    })

  const run = (action: () => Promise<{ message: string } | { error: string }>) =>
    startTransition(async () => {
      const result = await action()

      if ('error' in result) {
        toast('error', result.error)

        return
      }

      toast('success', result.message)
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <Button
        variant='outline'
        onClick={() => {
          setDraft(layout)
          setOpen(true)
        }}
      >
        <TbLayoutDashboard />
        Customize
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className='flex w-full flex-col gap-5 overflow-y-auto sm:max-w-lg' data-testid='dashboard-customize'>
          <SheetHeader>
            <SheetTitle>Customize dashboard</SheetTitle>
            <SheetDescription>Choose the blocks you see, their order and size. Only you see these changes.</SheetDescription>
          </SheetHeader>

          <ul className='flex flex-col gap-2'>
            {shown.map((item, index) => {
              const definition = blockDefinition(item.id)

              return (
                <li key={item.id} className='border-border flex flex-wrap items-center gap-2 rounded-md border p-2' data-customize-block={item.id}>
                  <label className='flex min-w-0 flex-1 items-center gap-2 text-sm font-medium'>
                    <input type='checkbox' checked={item.visible} onChange={event => update(item.id, { visible: event.target.checked })} aria-label={`Show ${definition.label}`} />
                    <span className='truncate'>{definition.label}</span>
                  </label>
                  <select className={SELECT} value={item.size} aria-label={`${definition.label} size`} onChange={event => update(item.id, { size: event.target.value as never })}>
                    {definition.sizes.map(size => (
                      <option key={size} value={size}>
                        {DASHBOARD_SIZE_LABELS[size]}
                      </option>
                    ))}
                  </select>
                  <Button size='icon' variant='ghost' disabled={index === 0} aria-label={`Move ${definition.label} up`} onClick={() => move(item.id, -1)}>
                    <TbArrowUp />
                  </Button>
                  <Button size='icon' variant='ghost' disabled={index === shown.length - 1} aria-label={`Move ${definition.label} down`} onClick={() => move(item.id, 1)}>
                    <TbArrowDown />
                  </Button>
                </li>
              )
            })}
          </ul>

          {modules.length ? (
            <div className='flex flex-col gap-2'>
              <p className='text-sm font-semibold'>My Workspace modules</p>
              <p className='text-textSecondary text-xs'>Untick a module to hide it from My Workspace. The left menu is not changed.</p>
              <div className='grid gap-1 sm:grid-cols-2'>
                {modules.map(item => (
                  <label key={item.key} className='flex items-center gap-2 text-sm'>
                    <input type='checkbox' checked={pinned === null || pinned.includes(item.key)} onChange={() => togglePin(item.key)} />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className='mt-auto flex flex-wrap gap-2'>
            <Button disabled={pending} onClick={() => run(() => saveDashboardLayout({ layout: draft }))}>
              {pending ? 'Saving...' : 'Save Layout'}
            </Button>
            <Button variant='outline' disabled={pending} onClick={() => run(() => resetDashboardLayout())}>
              Reset to Default
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export default DashboardCustomize
