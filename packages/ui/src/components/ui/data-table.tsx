'use client'

// React Imports
import { useMemo, useState, useRef } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

// Next Imports
import { useRouter, useSearchParams } from 'next/navigation'

// Third-party Imports
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { TbArrowNarrowDown, TbArrowNarrowUp, TbHourglassEmpty } from 'react-icons/tb'
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table'

// Components Imports
import { Avatar, AvatarFallback } from './avatar'
import { Input } from './input'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from './pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import type { InputProps } from './input'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type Props = {
  data: any[]
  columns: ColumnDef<any, any>[]
  search:
    | ({
        enabled: true
      } & {
        position?: 'start' | 'end'
        placeholder?: string
      })
    | ({
        enabled: false
      } & {
        position?: never
        placeholder?: never
      })
  title?: ReactNode
  actions?: ReactNode
  enableUrlSync?: boolean
  loading?: boolean
}

// Vars
const DebouncedInput = ({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  debounce?: number
} & Omit<InputProps, 'onChange'>) => {
  // States
  const [value, setValue] = useState(initialValue)

  // To handle input change and debounce
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)

    const timeout = setTimeout(() => {
      onChange(e.target.value)
    }, debounce)

    return () => clearTimeout(timeout)
  }

  return <Input {...props} value={value} onChange={handleChange} />
}

const DataTable = (props: Props) => {
  // Props
  const {
    data,
    columns,
    title,
    search = { enabled: true, position: 'end' },
    actions,
    enableUrlSync = true,
    loading
  } = props

  // States
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState({})

  // Hooks
  const searchParams = useSearchParams()
  const router = useRouter()
  const navigationPending = useRef(false)

  // Global filter state
  const [globalFilter, setGlobalFilter] = useState(searchParams.get('search') || '')

  // Vars
  const pageParam = searchParams.get('page')
  const pageSizeParam = searchParams.get('per_page')
  const page = pageParam && !isNaN(Number(pageParam)) && Number(pageParam) > 0 ? Number(pageParam) : 1

  const perPage =
    pageSizeParam && !isNaN(Number(pageSizeParam)) && Number(pageSizeParam) > 0 ? Number(pageSizeParam) : 5

  // State for pagination controls
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: page - 1,
    pageSize: perPage
  })

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize
    }),
    [pageIndex, pageSize]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      rowSelection,
      globalFilter
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter
  })

  // To update the URL based on pagination and search changes
  const updateUrl = (newPage: number, newPageSize: number, searchTerm = '') => {
    // Prevent multiple URL updated during the same render cycle
    if (!navigationPending.current) {
      navigationPending.current = true

      // Use setTimeout with 0ms to delay the URL update until after render completes.
      // avoiding "Cannot update a component while rendering another" error.
      setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())

        // Set or remove the search params as needed
        params.set('page', (newPage + 1).toString())
        params.set('per_page', newPageSize.toString())
        searchTerm ? params.set('search', searchTerm) : params.delete('search')

        router.replace(`?${params.toString()}`, {
          scroll: false
        })
        navigationPending.current = false
      }, 0)
    }
  }

  // To update the page index for pagination
  const updatePageIndex = (newPageIndex: number) => {
    setPagination(prev => {
      if (enableUrlSync) {
        updateUrl(newPageIndex, prev.pageSize, globalFilter)
      }

      return { ...prev, pageIndex: newPageIndex }
    })
  }

  // To update the page size for pagination
  const updatePageSize = (newPageSize: number) => {
    setPagination(prev => {
      if (enableUrlSync) {
        updateUrl(prev.pageIndex, newPageSize, globalFilter)
      }

      return { ...prev, pageSize: newPageSize }
    })
  }

  // To Handle search input change and update the global filter
  const handleSearchChange = (value: string) => {
    setGlobalFilter(value)
    setPagination(prev => {
      if (enableUrlSync) {
        updateUrl(0, prev.pageSize, value)
      }

      return { ...prev, pageIndex: 0 }
    })
  }

  return (
    <div className='data-table'>
      {(title || search.enabled || actions) && (
        <div
          className={cn('pli-6 plb-4 border-be flex flex-wrap gap-4 max-sm:flex-col sm:items-center', {
            'justify-between': search.position !== 'start',
            'justify-end': !title && search.position !== 'start'
          })}
        >
          {title}
          {search.enabled && actions ? (
            <div
              className={cn('flex justify-between gap-4 max-sm:flex-col sm:items-center', {
                'is-full': search.position === 'start'
              })}
            >
              {search.enabled && (
                <DebouncedInput
                  placeholder={search.placeholder ?? 'Search...'}
                  value={globalFilter ?? ''}
                  onChange={value => handleSearchChange(String(value))}
                  className='sm:is-64'
                />
              )}
              {actions}
            </div>
          ) : search.enabled ? (
            <DebouncedInput
              placeholder={search.placeholder ?? 'Search...'}
              value={globalFilter ?? ''}
              onChange={value => handleSearchChange(String(value))}
              className='sm:is-64'
            />
          ) : (
            actions
          )}
        </div>
      )}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                return (
                  <TableHead key={header.id} className='[&_svg]:hover:visible'>
                    {header.isPlaceholder ? null : (
                      <>
                        <div
                          className={cn('flex items-center gap-1 text-nowrap', {
                            'cursor-pointer select-none': header.column.getCanSort()
                          })}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted()
                            ? ({
                                asc: <TbArrowNarrowUp className='text-xl' />,
                                desc: <TbArrowNarrowDown className='text-xl' />
                              }[header.column.getIsSorted() as 'asc' | 'desc'] ?? null)
                            : header.column.getCanSort() && (
                                <TbArrowNarrowDown className='text-textDisabled invisible text-xl' />
                              )}
                        </div>
                      </>
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className='!plb-12 text-center'>
                <div className='flex flex-col items-center gap-2'>
                  <Avatar color='secondary' size='3xl' shape='circle'>
                    <AvatarFallback>
                      <TbHourglassEmpty className='text-2xl' />
                    </AvatarFallback>
                  </Avatar>
                  <p className='text-textPrimary font-medium'>Loading...</p>
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map(row => (
              <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id} className='text-nowrap'>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className='!plb-12 text-center'>
                <div className='flex flex-col items-center gap-2'>
                  <Avatar color='secondary' size='3xl' shape='circle'>
                    <AvatarFallback>
                      <TbHourglassEmpty className='text-2xl' />
                    </AvatarFallback>
                  </Avatar>
                  <p className='text-textPrimary font-medium'>No Results</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className='pli-6 plb-4 flex flex-wrap items-center justify-end gap-4'>
        <div className='flex flex-wrap items-center gap-4'>
          <div className='space-i-2 flex items-center'>
            <span className='text-muted-foreground text-nowrap text-sm'>Rows per page</span>
            <Select value={pageSize.toString()} onValueChange={value => updatePageSize(Number(value))}>
              <SelectTrigger size='sm' className='is-16'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='5'>5</SelectItem>
                <SelectItem value='10'>10</SelectItem>
                <SelectItem value='25'>25</SelectItem>
                <SelectItem value='50'>50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => {
                      if (table.getCanPreviousPage()) {
                        updatePageIndex(pageIndex - 1)
                      }
                    }}
                    className={table.getCanPreviousPage() ? 'cursor-pointer' : 'pointer-events-none opacity-[0.48]'}
                  />
                </PaginationItem>
                {Array.from({ length: table.getPageCount() }).map((_, index) => (
                  <PaginationItem key={index}>
                    <PaginationLink
                      isActive={table.getState().pagination.pageIndex === index}
                      onClick={() => {
                        updatePageIndex(index)
                      }}
                    >
                      {index + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => {
                      updatePageIndex(pageIndex + 1)
                    }}
                    className={table.getCanNextPage() ? 'cursor-pointer' : 'pointer-events-none opacity-[0.48]'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DataTable
