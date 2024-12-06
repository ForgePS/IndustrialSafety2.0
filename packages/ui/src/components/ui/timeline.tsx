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
  <li ref={ref} className={cn('group flex gap-4', className)} {...props} />
))

TimelineItem.displayName = 'TimelineItem'

const TimelineTime = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-textPrimary min-is-[165px] max-is-[165px] flex flex-1 flex-col items-end gap-2.5 text-base',
      className
    )}
    {...props}
  />
))

TimelineTime.displayName = 'TimelineTime'

const TimelineSeparator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col items-center justify-stretch', className)} {...props} />
))

TimelineSeparator.displayName = 'TimelineSeparator'

const TimelineIcon = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('bg-card flex size-[34px] shrink-0 items-center justify-center rounded-full border', className)}
    {...props}
  >
    <TbCalendar className='text-textPrimary size-[22px]' />
  </div>
))

TimelineIcon.displayName = 'TimelineIcon'

const TimelineConnector = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('bs-full is-px bg-border', className)} {...props} />
))

TimelineConnector.displayName = 'TimelineConnector'

const TimelineContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-card mbe-6 sm:mbe-10 group-last:mbe-0 flex flex-1 flex-col items-start rounded-xl border p-6',
      className
    )}
    {...props}
  />
))

TimelineContent.displayName = 'TimelineContent'

const TimelineDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-textSecondary is-full flex flex-col gap-4 text-base', className)} {...props} />
  )
)

TimelineDescription.displayName = 'TimelineDescription'

export {
  Timeline,
  TimelineItem,
  TimelineTime,
  TimelineSeparator,
  TimelineIcon,
  TimelineConnector,
  TimelineContent,
  TimelineDescription
}
