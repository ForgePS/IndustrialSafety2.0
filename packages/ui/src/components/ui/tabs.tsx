'use client'

// React Imports
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as TabsPrimitive from '@radix-ui/react-tabs'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn('text-textPrimary bg-base-200 inline-flex items-center justify-center rounded-lg p-0.5', className)}
      {...props}
    />
  )
)

TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'pli-4 plb-2 ring-offset-background focus-visible:outline-primary/20 data-[state=active]:bg-primary hover:text-primary inline-flex items-center justify-center whitespace-nowrap rounded-md text-base outline-none outline-offset-0 transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-white',
      className
    )}
    {...props}
  />
))

TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mbs-2 focus-visible:outline-none', className)} {...props} />
))

TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
