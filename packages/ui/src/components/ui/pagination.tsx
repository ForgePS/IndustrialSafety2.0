// React Imports
import { forwardRef } from 'react'
import type { ComponentProps } from 'react'

// Third-party Imports
import { TbChevronsLeft, TbChevronsRight, TbDots } from 'react-icons/tb'

// Type Imports
import type { ButtonProps } from './button'

// Component Imports
import { buttonVariants } from './button'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Pagination = ({ className, ...props }: ComponentProps<'nav'>) => (
  <nav
    role='navigation'
    aria-label='pagination'
    className={cn('mli-auto is-full flex justify-center', className)}
    {...props}
  />
)

Pagination.displayName = 'Pagination'

const PaginationContent = forwardRef<HTMLUListElement, ComponentProps<'ul'>>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
))

PaginationContent.displayName = 'PaginationContent'

const PaginationItem = forwardRef<HTMLLIElement, ComponentProps<'li'>>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn('', className)} {...props} />
))

PaginationItem.displayName = 'PaginationItem'

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<ButtonProps, 'size'> &
  ComponentProps<'a'>

const PaginationLink = ({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) => (
  <a
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? 'default' : 'ghost',
        size
      }),
      className
    )}
    {...props}
  />
)

PaginationLink.displayName = 'PaginationLink'

const PaginationPrevious = ({ className, ...props }: ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label='Go to previous page'
    size='default'
    className={cn('bs-[38px] is-[38px] gap-1', className)}
    {...props}
  >
    <TbChevronsLeft className='bs-[22px] is-[22px]' />
  </PaginationLink>
)

PaginationPrevious.displayName = 'PaginationPrevious'

const PaginationNext = ({ className, ...props }: ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label='Go to next page'
    size='default'
    className={cn('bs-[38px] is-[38px] gap-1', className)}
    {...props}
  >
    <TbChevronsRight className='bs-[22px] is-[22px]' />
  </PaginationLink>
)

PaginationNext.displayName = 'PaginationNext'

const PaginationEllipsis = ({ className, ...props }: ComponentProps<'span'>) => (
  <span aria-hidden className={cn('bs-[38px] is-[38px] flex items-center justify-center', className)} {...props}>
    <TbDots className='bs-[22px] is-[22px]' />
    <span className='sr-only'>More pages</span>
  </span>
)

PaginationEllipsis.displayName = 'PaginationEllipsis'

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
}
