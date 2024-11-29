// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as SelectPrimitive from '@radix-ui/react-select'
import { TbChevronDown, TbChevronUp } from 'react-icons/tb'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const selectVariants = cva(
  'border-input bg-card text-textSecondary placeholder:text-textDisabled focus-visible:outline-primary focus-visible:shadow-primarySm disabled:bg-neutral/10 flex items-center justify-between rounded-md border focus-visible:outline-none focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:border-transparent [&>span]:line-clamp-1 [&[aria-expanded="true"]_svg]:rotate-180',
  {
    variants: {
      size: {
        sm: 'bs-[30px] pli-2.5 plb-1 gap-1 text-sm',
        md: 'bs-[38px] pli-3 plb-2 gap-1.5 text-base',
        lg: 'bs-[46px] pli-4 plb-[11px] gap-2 text-lg'
      }
    }
  }
)

export interface SelectProps
  extends ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectVariants> {}

const Select = SelectPrimitive.Root

const SelectValue = SelectPrimitive.Value

const SelectTrigger = forwardRef<ElementRef<typeof SelectPrimitive.Trigger>, SelectProps>(
  ({ size = 'md', className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger ref={ref} className={cn(selectVariants({ size, className }))} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <TbChevronDown
          className={cn('text-textSecondary min-is-fit', {
            'text-base': size === 'sm',
            'text-xl': size === 'md',
            'text-[22px]': size === 'lg'
          })}
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
)

SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('plb-1 flex cursor-n-resize items-center justify-center', className)}
    {...props}
  >
    <TbChevronUp className='text-base' />
  </SelectPrimitive.ScrollUpButton>
))

SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('plb-1 flex cursor-s-resize items-center justify-center', className)}
    {...props}
  >
    <TbChevronDown className='text-base' />
  </SelectPrimitive.ScrollDownButton>
))

SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'max-bs-96 min-is-[8rem] bg-popover text-textPrimary data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 overflow-hidden rounded-md shadow-lg',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-0.5 data-[side=left]:-translate-x-0.5 data-[side=right]:translate-x-0.5 data-[side=top]:-translate-y-0.5',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-2',
          position === 'popper' &&
            'bs-[var(--radix-select-trigger-height)] is-full min-is-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))

SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectGroup = forwardRef<
  ElementRef<typeof SelectPrimitive.Group>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Group>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Group ref={ref} className={cn('mbs-0.5 first:mbs-0', className)} {...props} />
))

SelectGroup.displayName = SelectPrimitive.Group.displayName

const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('plb-2 pli-4 text-textDisabled text-xs uppercase', className)}
    {...props}
  />
))

SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'is-full plb-2.5 pli-4 [&[data-state="checked"]]:bg-primary/10 [&[data-state="checked"]]:focus:bg-primary/20 [&[data-state="checked"]]:text-primary focus:bg-neutral/10 mbs-0.5 first:mbs-0 relative flex select-none items-center rounded-md text-base outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-[0.48]',
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))

SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn('mlb-1 bs-px bg-border', className)} {...props} />
))

SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton
}
