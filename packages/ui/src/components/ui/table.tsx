// React Imports
import { forwardRef } from 'react'
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className='is-full relative overflow-auto'>
    <table ref={ref} className={cn('is-full caption-bottom text-base', className)} {...props} />
  </div>
))

Table.displayName = 'Table'

const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn('[&_tr]:border-be bg-secondary/[0.04] text-textPrimary [&_tr]:hover:bg-transparent', className)}
      {...props}
    />
  )
)

TableHeader.displayName = 'TableHeader'

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('text-textSecondary', className)} {...props} />
)

TableBody.displayName = 'TableBody'

const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn(
        'border-bs bg-secondary/[0.04] [&>tr]:last:border-be-0 font-medium [&_tr]:hover:bg-transparent',
        className
      )}
      {...props}
    />
  )
)

TableFooter.displayName = 'TableFooter'

const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('border-be data-[state=selected]:bg-primary/[0.04] transition-colors', className)}
      {...props}
    />
  )
)

TableRow.displayName = 'TableRow'

const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'pli-6 plb-2 bs-[50px] text-muted-foreground [&:has([role=checkbox])]:pie-0 text-start align-middle text-base font-semibold',
        className
      )}
      {...props}
    />
  )
)

TableHead.displayName = 'TableHead'

const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('pli-6 plb-2 bs-[52px] [&:has([role=checkbox])]:pie-0 align-middle', className)}
      {...props}
    />
  )
)

TableCell.displayName = 'TableCell'

const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mbs-4 text-textSecondary pbe-4 text-sm', className)} {...props} />
  )
)

TableCaption.displayName = 'TableCaption'

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
