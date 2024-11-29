// React Imports
import { forwardRef } from 'react'
import type { HTMLAttributes, LiHTMLAttributes } from 'react'

// Third-party Imports
import { TbCalendar } from 'react-icons/tb'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Timeline = forwardRef<HTMLOListElement, HTMLAttributes<HTMLOListElement>>(({ className, ...props }, ref) => (
  <ol ref={ref} className={cn('flex flex-col', className)} {...props} />
))

Timeline.displayName = 'Timeline'

const TimelineItem = forwardRef<HTMLLIElement, LiHTMLAttributes<HTMLLIElement>>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    className={cn('pbs-0 sm:[&>*]:mie-4 [&>*]:mie-2.5 relative flex items-start p-6', className)}
    {...props}
  />
))

TimelineItem.displayName = 'TimelineItem'

const TimelineTime = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'block-start-1 absolute start-2 flex -translate-x-full flex-col items-end gap-y-3 text-base',
        className
      )}
      {...props}
    />
  )
)

TimelineTime.displayName = 'TimelineTime'

const TimelineConnector = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'inline-start-[42px] bs-full is-px bg-foreground/30 absolute -translate-x-1/2 translate-y-2',
      className
    )}
    {...props}
  />
))

TimelineConnector.displayName = 'TimelineConnector'

const TimelineHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center gap-4', className)} {...props} />
))

TimelineHeader.displayName = 'TimelineHeader'

const TimelineIcon = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('bg-card z-[1] flex size-[34px] flex-col items-center justify-center rounded-full border', className)}
    {...props}
  >
    <TbCalendar className='text-textPrimary] size-[22px]' />
  </div>
))

TimelineIcon.displayName = 'TimelineIcon'

const TimelineDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-textSecondary is-full flex flex-col gap-y-4 text-base', className)} {...props} />
  )
)

TimelineDescription.displayName = 'TimelineDescription'

const TimelineContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-card min-is-[300px] max-is-[300px] sm:min-is-[350px] sm:max-is-[350px] md:min-is-[430px] lg:min-is-[575px] flex flex-col items-start rounded-xl border p-6',
      className
    )}
    {...props}
  />
))

TimelineContent.displayName = 'TimelineContent'

export {
  Timeline,
  TimelineItem,
  TimelineConnector,
  TimelineHeader,
  TimelineIcon,
  TimelineDescription,
  TimelineContent,
  TimelineTime
}
