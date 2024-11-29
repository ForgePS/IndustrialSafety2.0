// React Imports
import type { ComponentProps } from 'react'

// Third-party Imports
import { DayPicker } from 'react-day-picker'
import { TbChevronLeft, TbChevronRight } from 'react-icons/tb'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

export type CalendarProps = ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('bg-card pli-3 pbs-4 pbe-2 rounded-md', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-b-4 sm:space-i-4 sm:space-b-0',
        month: 'space-b-4',
        weeknumber: 'weeknumber',
        caption: 'flex justify-between relative items-center pli-1',
        caption_label: 'text-base text-textPrimary font-medium',
        nav: 'flex items-center gap-1.5',
        nav_button: 'inline-flex items-center justify-center rounded-full bs-7 is-7 bg-neutral/10 text-textSecondary',
        nav_icon: 'bs-4 is-4',
        table: 'is-full border-collapse space-b-1',
        head_row: 'flex',
        head_cell: 'text-textPrimary rounded-md is-[2.375rem] font-normal text-sm pli-2 plb-1',
        row: 'flex is-full mbs-0.5',
        cell: 'bs-[38px] is-[38px] inline-flex items-center justify-center text-textPrimary p-0 relative [&:has([aria-selected].day-range-start)]:rounded-s-full [&:has([aria-selected].day-range-end)]:rounded-e-full [&:has(.day-today)]:bg-primary/20 [&:has(.day-today)]:text-primary rounded-full hover:bg-neutral/10 [&:has(.weeknumber):hover]:bg-transparent',
        day: 'inline-flex items-center justify-center bs-[38px] is-[38px] p-0 font-normal',
        day_range_start: 'day-range-start rounded-e-none [&.day-range-end]:rounded-e-full',
        day_range_end: 'day-range-end rounded-s-none [&.day-range-start]:rounded-s-full',
        day_selected: 'bg-primary text-primary-foreground shadow rounded-full',
        day_today: 'day-today',
        day_outside: 'day-outside text-textDisabled aria-selected:text-primary-foreground',
        day_disabled: 'text-textDisabled',
        day_range_middle:
          'aria-selected:bg-primary/20 rounded-none aria-selected:text-primary shadow-none [&.day-outside]:bg-neutral/10 [&.day-outside]:text-primary',
        day_hidden: 'invisible',
        ...classNames
      }}
      components={{
        IconLeft: ({ ...props }) => <TbChevronLeft {...props} />,
        IconRight: ({ ...props }) => <TbChevronRight {...props} />
      }}
      {...props}
    />
  )
}

Calendar.displayName = 'Calendar'

export { Calendar }
