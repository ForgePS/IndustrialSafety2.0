'use client'

// React Imports
import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ComponentProps, CSSProperties, ElementRef } from 'react'

// Third-party Imports
import { Slot } from '@radix-ui/react-slot'
import { TbLayoutSidebar } from 'react-icons/tb'
import { cva } from 'class-variance-authority'
import PerfectScrollbar from 'react-perfect-scrollbar'
import type { VariantProps } from 'class-variance-authority'

// Component Imports
import { Button } from './button'
import { Input } from './input'
import { Separator } from './separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet'
import { Skeleton } from './skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

// Hook Imports
import { useIsMobile } from '@repo/ui/hooks/use-mobile'
import { useObjectCookie } from '@repo/ui/hooks/useObjectCookie'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type SidebarContext = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

// Vars
const SIDEBAR_COOKIE_NAME = 'is-sidebar-open'
const SIDEBAR_WIDTH = '18.75rem'
const SIDEBAR_WIDTH_MOBILE = '18.75rem'
const SIDEBAR_WIDTH_ICON = '4.5625rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

const SidebarContext = createContext<SidebarContext | null>(null)

const useSidebar = () => {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}

const SidebarProvider = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & {
    defaultOpen: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(({ defaultOpen, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }, ref) => {
  // States
  const [openMobile, setOpenMobile] = useState(false)

  // Cookies
  const [sidebarCookie, updateSidebarCookie] = useObjectCookie<boolean>(SIDEBAR_COOKIE_NAME, defaultOpen)

  // Hooks
  const isMobile = useIsMobile()

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = useState(sidebarCookie)
  const open = openProp ?? _open

  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value

      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This updates the cookie to keep the sidebar state.
      updateSidebarCookie(openState)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = useCallback(() => {
    return isMobile ? setOpenMobile(open => !open) : setOpen(open => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? 'expanded' : 'collapsed'

  const contextValue = useMemo<SidebarContext>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...style
          } as CSSProperties
        }
        className={cn(
          'group/sidebar-wrapper min-bs-svh is-full has-[[data-variant=inset]]:bg-background flex',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
})

SidebarProvider.displayName = 'SidebarProvider'

const Sidebar = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & {
    side?: 'left' | 'right'
    variant?: 'sidebar' | 'floating' | 'inset'
    collapsible?: 'offcanvas' | 'icon' | 'none'
  }
>(({ side = 'left', variant = 'sidebar', collapsible = 'offcanvas', className, children, ...props }, ref) => {
  // Hooks
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === 'none') {
    return (
      <div
        className={cn('bs-full min-is-[--sidebar-width] bg-sidebar text-sidebar-foreground flex flex-col', className)}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar='sidebar'
          data-mobile='true'
          className='is-[--sidebar-width] bg-sidebar text-sidebar-foreground p-0 [&>button]:hidden'
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH_MOBILE
            } as CSSProperties
          }
          side={side}
        >
          <SheetTitle hidden />
          <SheetDescription hidden />
          <div className='bs-full is-full flex flex-col'>{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      ref={ref}
      className='text-sidebar-foreground group peer z-20 hidden md:block'
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        className={cn(
          'bs-svh is-[--sidebar-width] relative bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:is-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:is-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]'
            : 'group-data-[collapsible=icon]:is-[--sidebar-width-icon]'
        )}
      />
      <div
        className={cn(
          'bs-svh is-[--sidebar-width] fixed inset-y-0 z-20 hidden transition-[left,right,width] duration-200 ease-linear md:flex',
          side === 'left'
            ? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
            : 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',

          // Adjust the padding for floating and inset variants.
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:is-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)] p-2'
            : 'group-data-[collapsible=icon]:is-[--sidebar-width-icon] group-data-[side=left]:border-ie group-data-[side=right]:border-is',
          className
        )}
        {...props}
      >
        <div
          data-sidebar='sidebar'
          className={cn(
            'bs-full is-full bg-sidebar group-data-[variant=floating]:border-sidebar-border flex flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow',
            {
              'bg-background': variant === 'inset'
            }
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
})

Sidebar.displayName = 'Sidebar'

const SidebarTrigger = forwardRef<ElementRef<typeof Button>, ComponentProps<typeof Button>>(
  ({ className, onClick, ...props }, ref) => {
    // Hooks
    const { toggleSidebar } = useSidebar()

    return (
      <Button
        ref={ref}
        data-sidebar='trigger'
        variant='ghost'
        size='icon'
        className={className}
        onClick={event => {
          onClick?.(event)
          toggleSidebar()
        }}
        {...props}
      >
        <TbLayoutSidebar fontSize='1.25rem' />
        <span className='sr-only'>Toggle Sidebar</span>
      </Button>
    )
  }
)

SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarRail = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(({ className, ...props }, ref) => {
  // Hooks
  const { toggleSidebar } = useSidebar()

  return (
    <button
      ref={ref}
      data-sidebar='rail'
      aria-label='Toggle Sidebar'
      tabIndex={-1}
      onClick={toggleSidebar}
      title='Toggle Sidebar'
      className={cn(
        'inset-block-0 is-4 after:inset-block-0 after:is-px hover:after:bg-sidebar-border absolute z-20 hidden -translate-x-1/2 transition-all ease-linear after:absolute after:start-1/2 group-data-[side=left]:-end-4 group-data-[side=right]:start-0 sm:flex',
        '[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:hover:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:start-full',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-end-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-start-2',
        className
      )}
      {...props}
    />
  )
})

SidebarRail.displayName = 'SidebarRail'

const SidebarInset = forwardRef<HTMLDivElement, ComponentProps<'main'>>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        'min-bs-svh bg-background relative flex flex-1 flex-col',
        'peer-data-[variant=inset]:min-bs-[calc(100svh-theme(spacing.4))] md:peer-data-[state=collapsed]:peer-data-[variant=inset]:mis-2 md:peer-data-[variant=inset]:mis-0 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow',
        className
      )}
      {...props}
    />
  )
})

SidebarInset.displayName = 'SidebarInset'

const SidebarInput = forwardRef<ElementRef<typeof Input>, ComponentProps<typeof Input>>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        data-sidebar='input'
        size='sm'
        className={cn('bg-background shadow-none', className)}
        {...props}
      />
    )
  }
)

SidebarInput.displayName = 'SidebarInput'

const SidebarHeader = forwardRef<HTMLDivElement, ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar='header'
      className={cn('pli-3 plb-3.5 border-be flex flex-col', className)}
      {...props}
    />
  )
})

SidebarHeader.displayName = 'SidebarHeader'

const SidebarFooter = forwardRef<HTMLDivElement, ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar='footer'
      className={cn('pli-3 plb-3.5 border-bs flex flex-col', className)}
      {...props}
    />
  )
})

SidebarFooter.displayName = 'SidebarFooter'

const SidebarSeparator = forwardRef<ElementRef<typeof Separator>, ComponentProps<typeof Separator>>(
  ({ className, ...props }, ref) => {
    return <Separator ref={ref} data-sidebar='separator' className={cn('bg-sidebar-border', className)} {...props} />
  }
)

SidebarSeparator.displayName = 'SidebarSeparator'

const SidebarContent = forwardRef<HTMLDivElement, ComponentProps<'div'>>(({ className, ...props }, ref) => {
  // Hooks
  const isMobile = useIsMobile()

  // Vars
  const ScrollWrapper = isMobile ? 'div' : PerfectScrollbar

  return (
    <ScrollWrapper
      ref={ref}
      data-sidebar='content'
      className={cn(
        'min-bs-0 flex flex-col group-data-[collapsible=icon]:overflow-hidden',
        { 'flex-1 overflow-auto': isMobile },
        className
      )}
      {...(!isMobile && { options: { wheelPropagation: false, suppressScrollX: true }, style: { flex: '1 1 0%' } })}
      {...props}
    />
  )
})

SidebarContent.displayName = 'SidebarContent'

const SidebarGroup = forwardRef<HTMLDivElement, ComponentProps<'div'>>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar='group'
      className={cn('is-full min-is-0 pli-3 first:pbs-4 pbe-4 relative flex flex-col', className)}
      {...props}
    />
  )
})

SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = forwardRef<HTMLDivElement, ComponentProps<'div'> & { asChild?: boolean }>(
  ({ className, asChild = false, ...props }, ref) => {
    // Vars
    const Comp = asChild ? Slot : 'div'

    return (
      <Comp
        ref={ref}
        data-sidebar='group-label'
        className={cn(
          'pli-3 text-sidebar-foreground/50 ring-sidebar-ring bs-10 group-data-[collapsible=icon]:pli-0 flex shrink-0 items-center overflow-hidden rounded-md text-sm outline-none transition-[margin,padding,opacity] duration-200 ease-linear focus-visible:ring-2 group-data-[collapsible=icon]:justify-center [&>svg]:size-5 [&>svg]:shrink-0',
          className
        )}
        {...props}
      />
    )
  }
)

SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarGroupAction = forwardRef<HTMLButtonElement, ComponentProps<'button'> & { asChild?: boolean }>(
  ({ className, asChild = false, ...props }, ref) => {
    // Vars
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        data-sidebar='group-action'
        className={cn(
          'block-start-[1.6875rem] is-5 text-sidebar-foreground/80 ring-sidebar-ring hover:neutral/10 hover:text-sidebar-foreground absolute end-6 flex aspect-square items-center justify-center rounded-md p-0 outline-none transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',

          // Increases the hit area of the button on mobile.
          'after:absolute after:-inset-2 after:xl:hidden',
          'group-data-[collapsible=icon]:hidden',
          className
        )}
        {...props}
      />
    )
  }
)

SidebarGroupAction.displayName = 'SidebarGroupAction'

const SidebarGroupContent = forwardRef<HTMLDivElement, ComponentProps<'div'>>(({ className, ...props }, ref) => (
  <div ref={ref} data-sidebar='group-content' className={cn('is-full text-sm', className)} {...props} />
))

SidebarGroupContent.displayName = 'SidebarGroupContent'

const SidebarMenu = forwardRef<HTMLUListElement, ComponentProps<'ul'>>(({ className, ...props }, ref) => (
  <ul ref={ref} data-sidebar='menu' className={cn('is-full min-is-0 flex flex-col gap-1', className)} {...props} />
))

SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = forwardRef<HTMLLIElement, ComponentProps<'li'>>(({ className, ...props }, ref) => (
  <li ref={ref} data-sidebar='menu-item' className={cn('group/menu-item relative', className)} {...props} />
))

SidebarMenuItem.displayName = 'SidebarMenuItem'

const sidebarMenuButtonVariants = cva(
  'peer/menu-button is-full pli-3 ring-sidebar-ring hover:bg-neutral/10 hover:text-sidebar-foreground active:bg-neutral/10 active:text-sidebar-foreground group-has-[[data-sidebar=menu-action]]/menu-item:pie-[38px] data-[active=true]:bg-primary/10 data-[active=true]:text-primary hover:data-[active=true]:bg-primary/[0.16] data-[state=open]:hover:bg-neutral/10 data-[state=open]:hover:text-sidebar-foreground flex items-center gap-1.5 overflow-hidden text-left outline-none transition-[width,padding,margin,gap] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-[0.48] aria-disabled:pointer-events-none aria-disabled:opacity-[0.48] [&>span:last-child]:truncate [&>svg]:shrink-0 first:[&>svg]:size-6',
  {
    variants: {
      variant: {
        default: 'hover:bg-neutral/10 hover:text-sidebar-foreground',
        outline:
          'bg-background hover:bg-neutral/10 hover:text-sidebar-foreground data-[active=true]:border-primary border'
      },
      size: {
        sm: 'bs-9 plb-2 group-data-[collapsible=icon]:mis-1.5 rounded text-sm group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:!gap-2 group-data-[collapsible=icon]:!p-2 first:[&>svg]:size-5',
        default:
          'bs-[42px] plb-[9px] group-data-[collapsible=icon]:mis-[3px] rounded-md text-base group-data-[collapsible=icon]:size-[42px] group-data-[collapsible=icon]:!gap-[9px] group-data-[collapsible=icon]:!p-[9px]',
        lg: 'bs-12 plb-3 rounded-lg text-base group-data-[collapsible=icon]:size-12 group-data-[collapsible=icon]:!gap-3 group-data-[collapsible=icon]:!p-3'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface SidebarMenuButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof sidebarMenuButtonVariants> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | ComponentProps<typeof TooltipContent>
}

const SidebarMenuButton = forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, isActive = false, variant = 'default', size = 'default', tooltip, className, ...props }, ref) => {
    // Hooks
    const { isMobile, state } = useSidebar()

    // Vars
    const Comp = asChild ? Slot : 'button'

    const button = (
      <Comp
        ref={ref}
        data-sidebar='menu-button'
        data-size={size}
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
        {...props}
      />
    )

    if (!tooltip) {
      return button
    }

    if (typeof tooltip === 'string') {
      tooltip = {
        children: tooltip
      }
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side='right' align='center' hidden={state !== 'collapsed' || isMobile} {...tooltip} />
      </Tooltip>
    )
  }
)

SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarMenuAction = forwardRef<
  HTMLButtonElement,
  ComponentProps<'button'> & {
    asChild?: boolean
    showOnHover?: boolean
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  // Vars
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      data-sidebar='menu-action'
      className={cn(
        'is-5 text-sidebar-foreground ring-sidebar-ring hover:bg-neutral/10 peer-hover/menu-button:text-sidebar-foreground absolute end-3 flex aspect-square items-center justify-center rounded-md p-0 outline-none transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',

        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 after:md:hidden',
        'peer-data-[size=sm]/menu-button:block-start-2',
        'peer-data-[size=default]/menu-button:block-start-[11px]',
        'peer-data-[size=lg]/menu-button:block-start-3.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'peer-data-[active=true]/menu-button:text-sidebar-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 xl:opacity-0',
        className
      )}
      {...props}
    />
  )
})

SidebarMenuAction.displayName = 'SidebarMenuAction'

const SidebarMenuBadge = forwardRef<HTMLDivElement, ComponentProps<'div'>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar='menu-badge'
    className={cn(
      'bs-6 min-is-6 bg-primary text-primary-foreground pli-3 plb-0.5 pointer-events-none absolute end-3 flex select-none items-center justify-center rounded-md text-sm tabular-nums',
      'peer-data-[size=sm]/menu-button:block-start-2 peer-data-[size=sm]/menu-button:pli-2 peer-data-[size=sm]/menu-button:bs-5 peer-data-[size=sm]/menu-button:text-xs',
      'peer-data-[size=default]/menu-button:block-start-[9px]',
      'peer-data-[size=lg]/menu-button:block-start-3',
      'group-data-[collapsible=icon]:hidden',
      className
    )}
    {...props}
  />
))

SidebarMenuBadge.displayName = 'SidebarMenuBadge'

const SidebarMenuSkeleton = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & {
    showIcon?: boolean
  }
>(({ className, showIcon = false, ...props }, ref) => {
  // Hooks
  // Random width between 50 to 90%.
  const width = useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar='menu-skeleton'
      className={cn('bs-9 pli-3 flex items-center gap-2 rounded-md', className)}
      {...props}
    >
      {showIcon && <Skeleton className='size-5 shrink-0 rounded-md' data-sidebar='menu-skeleton-icon' />}
      <Skeleton
        className='bs-5 max-is-[--skeleton-width] flex-1'
        data-sidebar='menu-skeleton-text'
        style={
          {
            '--skeleton-width': width
          } as CSSProperties
        }
      />
    </div>
  )
})

SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton'

const SidebarMenuSub = forwardRef<HTMLUListElement, ComponentProps<'ul'>>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar='menu-sub'
    className={cn(
      'border-sidebar-border min-is-0 mis-6 pis-3 pbs-1 flex translate-x-px flex-col gap-1 border-l',
      'peer-data-[size=sm]/menu-button:mis-5 group-data-[collapsible=icon]:hidden',
      className
    )}
    {...props}
  />
))

SidebarMenuSub.displayName = 'SidebarMenuSub'

const SidebarMenuSubItem = forwardRef<HTMLLIElement, ComponentProps<'li'>>(({ ...props }, ref) => (
  <li ref={ref} {...props} />
))

SidebarMenuSubItem.displayName = 'SidebarMenuSubItem'

const SidebarMenuSubButton = forwardRef<
  HTMLAnchorElement,
  ComponentProps<'a'> & {
    asChild?: boolean
    size?: 'sm' | 'md'
    isActive?: boolean
  }
>(({ asChild = false, size = 'md', isActive, className, ...props }, ref) => {
  // Vars
  const Comp = asChild ? Slot : 'a'

  return (
    <Comp
      ref={ref}
      data-sidebar='menu-sub-button'
      data-size={size}
      data-active={isActive}
      className={cn(
        'min-is-0 pli-3 text-sidebar-foreground ring-sidebar-ring hover:bg-neutral/10 hover:text-sidebar-foreground active:bg-neutral/10 active:text-sidebar-foreground [&>svg]:text-sidebar-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary hover:data-[active=true]:bg-primary/[0.16] flex -translate-x-px items-center gap-2 overflow-hidden rounded-md outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-[0.48] aria-disabled:pointer-events-none aria-disabled:opacity-[0.48] [&>span:last-child]:truncate [&>svg]:shrink-0',
        size === 'sm' && 'bs-9 text-sm first:[&>svg]:size-5',
        size === 'md' && 'bs-[42px] text-base first:[&>svg]:size-6',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
})

SidebarMenuSubButton.displayName = 'SidebarMenuSubButton'

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
}
