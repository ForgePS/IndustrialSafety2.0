'use client'

// React Imports
import { forwardRef, createContext, useContext } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

// Third-party Imports
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { TbChevronDown, TbChevronLeft, TbMinus, TbPlus } from 'react-icons/tb'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const AccordionContext = createContext<{ variant?: 'outline' | 'default' | 'split' | null }>({})

const accordionVariants = cva('', {
  variants: {
    variant: {
      outline: 'bg-card rounded-md border',
      split: '',
      default: ''
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

const Accordion = forwardRef<
  ElementRef<typeof AccordionPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Root> & VariantProps<typeof accordionVariants>
>(({ className, variant = 'default', ...props }, ref) => (
  <AccordionContext.Provider value={{ variant }}>
    <AccordionPrimitive.Root ref={ref} className={cn(accordionVariants({ variant }), className)} {...props} />
  </AccordionContext.Provider>
))

const AccordionItem = forwardRef<
  ElementRef<typeof AccordionPrimitive.Item>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => {
  const { variant } = useContext(AccordionContext)

  const variantClass = cn(
    'border-be',
    variant === 'outline' && 'last-of-type:border-be-0',
    variant === 'split' && 'bg-card mbe-2 shadow rounded-md last-of-type:mbe-0 border-be-0'
  )

  return (
    <AccordionPrimitive.Item ref={ref} className={cn('text-textPrimary text-lg', variantClass, className)} {...props} />
  )
})

AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = forwardRef<
  ElementRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const { variant } = useContext(AccordionContext)

  return (
    <AccordionPrimitive.Header className='flex'>
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          'pli-5 plb-4 focus-visible:ring-textDisabled group flex flex-1 items-center justify-between font-medium transition-transform focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 [&[data-state=open]>svg]:rotate-180',
          className
        )}
        {...props}
      >
        {children}
        {variant === 'outline' ? (
          <TbChevronDown className='bs-[18px] is-[18px] text-foreground shrink-0 transition-transform duration-200' />
        ) : variant === 'split' ? (
          <TbChevronLeft className='bs-[18px] is-[18px] text-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:-rotate-90' />
        ) : (
          <>
            <TbMinus className='bs-[18px] is-[18px] text-foreground shrink-0 transition-transform duration-200 group-data-[state=closed]:hidden' />
            <TbPlus className='bs-[18px] is-[18px] text-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:hidden' />
          </>
        )}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
})

AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = forwardRef<
  ElementRef<typeof AccordionPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className='data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-base transition-all'
    {...props}
  >
    <div className={cn('pbe-4 pbs-0 pli-5', className)}>{children}</div>
  </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
