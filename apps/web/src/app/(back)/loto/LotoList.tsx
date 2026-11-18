'use client'

import { useEffect, useState, useTransition } from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  TbArchive,
  TbArrowDown,
  TbArrowUp,
  TbArrowsSort,
  TbCheck,
  TbClock,
  TbEdit,
  TbFileText,
  TbLock,
  TbPlus,
  TbPrinter,
  TbSearch
} from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { toast } from '@repo/ui/utils/toast'

import { retireLotoProcedure } from './actions'
import {
  LOTO_PAGE_SIZES,
  lotoListQuery,
  nextSort,
  type LotoListParams,
  type LotoListStats,
  type LotoSortKey
} from '@/lib/forgeLotoList'

export type LotoListItem = {
  id: string
  procedure_number: string
  title: string
  status: string
  revision_number: number
  next_review_date: string | null
  effective_date: string | null
  updated_at: string | null
  assetName: string | null
  assetNumber: string | null
  locationId: string | null
  locationName: string | null
  divisionId: string | null
  divisionName: string | null
  lockedOut: boolean
}

type Option = { id: string; name: string }

const MAX_BATCH_PRINT = 100
const selectClass = 'border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'

const LotoList = ({
  procedures,
  paging,
  params,
  stats,
  locationOptions,
  divisionOptions,
  canCreate,
  canRetire,
  statusLabels,
  tabs
}: {
  procedures: LotoListItem[]
  paging: { page: number; pageCount: number; total: number; from: number; to: number }
  params: LotoListParams
  stats: LotoListStats
  locationOptions: Option[]
  divisionOptions: Option[]
  canCreate: boolean
  canRetire: boolean
  statusLabels: Record<string, string>
  tabs: React.ReactNode
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(params.q)
  const [selected, setSelected] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  const go = (patch: Partial<LotoListParams>) => router.replace(pathname + lotoListQuery(params, patch), { scroll: false })

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (search.trim() === params.q) return
    const timer = setTimeout(() => go({ q: search.trim() }), 350)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const retire = (procedure: LotoListItem) => {
    const reason = window.prompt(
      `Retire ${procedure.procedure_number} (${procedure.title})?\nRetirement preserves revision, review and lockout history.\n\nRetirement reason (optional):`,
      ''
    )

    if (reason === null) return

    startTransition(async () => {
      const result: any = await retireLotoProcedure({ procedureId: procedure.id, reason })

      if (result?.error) toast('error', result.error)
      else {
        toast('success', 'Procedure retired.')
        setSelected(current => current.filter(id => id !== procedure.id))
        router.refresh()
      }
    })
  }

  const today = new Date().toISOString().slice(0, 10)

  const statCards = [
    { label: 'Procedures', value: stats.procedures, icon: <TbFileText />, status: 'active' },
    { label: 'Drafts', value: stats.drafts, icon: <TbEdit />, status: 'draft' },
    { label: 'In review', value: stats.reviews, icon: <TbClock />, status: 'review' },
    { label: 'Active', value: stats.active, icon: <TbCheck />, status: 'approved' },
    { label: 'Open lockouts', value: stats.openLockouts, icon: <TbLock />, href: '/loto/lockouts' }
  ]

  const SortHead = ({ label, sortKey }: { label: string; sortKey: LotoSortKey }) => {
    const active = params.sort === sortKey

    return (
      <button
        type='button'
        className='inline-flex items-center gap-1 font-medium hover:underline'
        aria-label={'Sort by ' + label}
        onClick={() => go(nextSort(params, sortKey))}
      >
        {label}
        {active ? params.dir === 'asc' ? <TbArrowUp /> : <TbArrowDown /> : <TbArrowsSort className='opacity-40' />}
      </button>
    )
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'><TbLock />Lockout / Tagout</h1>
          <p className='text-textSecondary mt-2'>Equipment-specific hazardous energy-control procedures, reviews, revision history and lockouts.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {selected.length ? (
            <Button variant='outline' asChild>
              <Link href={'/loto-print?ids=' + selected.join(',')} target='_blank' rel='noopener'>
                <TbPrinter />Print {selected.length} selected
              </Link>
            </Button>
          ) : null}
          {canCreate ? <Button asChild><Link href='/loto/create'><TbPlus />Create Procedure</Link></Button> : null}
        </div>
      </div>

      <div className='grid grid-cols-2 gap-3 md:grid-cols-5' data-testid='loto-stats'>
        {statCards.map(card => {
          const body = (
            <CardContent className='flex items-center gap-3 p-4'>
              <span className='text-primary text-2xl'>{card.icon}</span>
              <div>
                <div className='text-textPrimary text-2xl font-bold' data-testid={'loto-stat-' + card.label.toLowerCase().replace(/\s+/g, '-')}>
                  {card.value}
                </div>
                <div className='text-textSecondary text-xs'>{card.label}</div>
              </div>
            </CardContent>
          )

          return (
            <Card key={card.label} className='hover:border-primary transition-colors'>
              {card.href ? (
                <Link href={card.href}>{body}</Link>
              ) : (
                <button type='button' className='w-full text-left' onClick={() => go({ status: card.status })}>{body}</button>
              )}
            </Card>
          )
        })}
      </div>

      {tabs}

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_180px_200px_200px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') go({ q: search.trim() })
              }}
              placeholder='Search LOTO procedures...'
              className='pl-10'
            />
          </div>
          <select aria-label='Status' value={params.status} onChange={event => go({ status: event.target.value })} className={selectClass}>
            <option value='active'>Current (not retired)</option>
            <option value='all'>All statuses</option>
            {['draft', 'review', 'approved', 'retired'].map(item => <option key={item} value={item}>{statusLabels[item] || item}</option>)}
          </select>
          <select aria-label='Location' value={params.location} onChange={event => go({ location: event.target.value })} className={selectClass}>
            <option value=''>All locations</option>
            {locationOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
          <select aria-label='Division' value={params.division} onChange={event => go({ division: event.target.value })} className={selectClass}>
            <option value=''>All divisions</option>
            {divisionOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-10'>
                <input
                  type='checkbox'
                  aria-label='Select all shown for printing'
                  checked={Boolean(procedures.length) && procedures.every(item => selected.includes(item.id))}
                  onChange={event =>
                    setSelected(current =>
                      event.target.checked
                        ? Array.from(new Set([...current, ...procedures.map(item => item.id)])).slice(0, MAX_BATCH_PRINT)
                        : current.filter(id => !procedures.some(item => item.id === id))
                    )
                  }
                />
              </TableHead>
              <TableHead><SortHead label='Procedure' sortKey='title' /> <span className='text-textSecondary'>/</span> <SortHead label='No.' sortKey='number' /></TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead><SortHead label='Status' sortKey='status' /></TableHead>
              <TableHead>Revision</TableHead>
              <TableHead><SortHead label='Next Review' sortKey='review' /></TableHead>
              <TableHead>Location</TableHead>
              <TableHead><SortHead label='Updated' sortKey='updated' /></TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {procedures.length ? procedures.map(procedure => {
              const overdue = Boolean(
                procedure.status === 'approved' &&
                procedure.next_review_date &&
                procedure.next_review_date < today
              )

              return (
                <TableRow key={procedure.id}>
                  <TableCell>
                    <input
                      type='checkbox'
                      aria-label={'Select ' + procedure.procedure_number + ' for printing'}
                      checked={selected.includes(procedure.id)}
                      disabled={!selected.includes(procedure.id) && selected.length >= MAX_BATCH_PRINT}
                      onChange={event =>
                        setSelected(current => (event.target.checked ? [...current, procedure.id] : current.filter(id => id !== procedure.id)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className='font-semibold'>{procedure.title}</div>
                    <div className='text-textSecondary text-xs'>{procedure.procedure_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>{procedure.assetName || 'Missing asset'}</div>
                    <div className='text-textSecondary text-xs'>{procedure.assetNumber || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      size='sm'
                      variant={
                        procedure.status === 'approved'
                          ? 'tonalSuccess'
                          : procedure.status === 'retired'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {statusLabels[procedure.status] || procedure.status}
                    </Badge>
                    {procedure.lockedOut ? <Badge size='sm' variant='destructive' className='ml-1'>Locked out</Badge> : null}
                  </TableCell>
                  <TableCell>Rev {procedure.revision_number}</TableCell>
                  <TableCell>
                    <span className={overdue ? 'text-destructive font-semibold' : ''}>
                      {procedure.next_review_date || '—'}
                    </span>
                    {overdue ? <div className='text-destructive text-xs'>Overdue</div> : null}
                  </TableCell>
                  <TableCell>
                    <div>{procedure.locationName || '—'}</div>
                    {procedure.divisionName ? <div className='text-textSecondary text-xs'>{procedure.divisionName}</div> : null}
                  </TableCell>
                  <TableCell className='text-sm'>{procedure.updated_at ? new Date(procedure.updated_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button size='sm' variant='outline' asChild><Link href={'/loto/' + procedure.id}>Open</Link></Button>
                      {canRetire && procedure.status !== 'retired' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={pending || procedure.lockedOut}
                          title={procedure.lockedOut ? 'Close the open lockout before retiring' : 'Retire (archive) this procedure'}
                          aria-label={'Retire ' + procedure.procedure_number}
                          onClick={() => retire(procedure)}
                        >
                          <TbArchive />Retire
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            }) : (
              <TableRow><TableCell colSpan={9} className='py-10 text-center'>No LOTO procedures match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className='flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm'>
          <div className='text-textSecondary' data-testid='loto-paging-summary'>
            {paging.total ? `Showing ${paging.from}–${paging.to} of ${paging.total}` : 'No results'}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <label className='text-textSecondary flex items-center gap-2'>
              Rows
              <select aria-label='Rows per page' value={params.size} onChange={event => go({ size: Number(event.target.value) })} className={selectClass}>
                {LOTO_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <Button size='sm' variant='outline' disabled={paging.page <= 1} onClick={() => go({ page: paging.page - 1 })}>Previous</Button>
            <span>Page {paging.page} of {paging.pageCount}</span>
            <Button size='sm' variant='outline' disabled={paging.page >= paging.pageCount} onClick={() => go({ page: paging.page + 1 })}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default LotoList
