'use client'

// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes } from 'react'

// Third-party Imports
import { type DialogProps } from '@radix-ui/react-dialog'
import { Command as CommandPrimitive } from 'cmdk'

// Component Imports
import { Dialog, DialogTitle, DialogContent, DialogDescription } from './dialog'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Command = forwardRef<ElementRef<typeof CommandPrimitive>, ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive
      ref={ref}
      className={cn('bs-full is-full text-popover-foreground flex flex-col overflow-hidden rounded-md', className)}
      {...props}
    />
  )
)

Command.displayName = CommandPrimitive.displayName

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogTitle hidden></DialogTitle>
      <DialogContent className='overflow-hidden p-0 shadow-xl'>
        <DialogDescription hidden></DialogDescription>

        <Command className='[&_[cmdk-group-heading]]:pli-4 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pbs-0 [&_[cmdk-group]]:pli-2 [&_[cmdk-input-wrapper]_svg]:bs-5 [&_[cmdk-input-wrapper]_svg]:is-5 [&_[cmdk-input]]:bs-12 [&_[cmdk-item]]:pli-4 [&_[cmdk-item]]:plb-2.5 [&_[cmdk-item]_svg]:bs-5 [&_[cmdk-item]_svg]:is-5 [&_[cmdk-group-heading]]:font-medium'>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className='border-be pli-4 flex items-center' cmdk-input-wrapper=''>
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'is-full plb-3 placeholder:text-textDisabled flex bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
))

CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-bs-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
))

CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => <CommandPrimitive.Empty ref={ref} className='plb-6 text-center text-sm' {...props} />)

CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'pli-1 pbe-3 pbs-1 text-foreground [&_[cmdk-group-heading]]:pli-2 [&_[cmdk-group-heading]]:plb-1.5 [&_[cmdk-group-heading]]:text-textDisabled overflow-hidden [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
      className
    )}
    {...props}
  />
))

CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = forwardRef<
  ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator ref={ref} className={cn('-mli-1 bs-px bg-border', className)} {...props} />
))

CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "pli-4 plb-1.5 data-[selected='true']:bg-accent relative flex cursor-default select-none items-center rounded text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-[0.48]",
      className
    )}
    {...props}
  />
))

CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn('mis-auto text-muted-foreground text-xs tracking-widest', className)} {...props} />
}

CommandShortcut.displayName = 'CommandShortcut'

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator
}
