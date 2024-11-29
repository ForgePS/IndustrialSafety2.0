'use client'

// React Imports
import type { ComponentProps } from 'react'

// Next Imports
import { useTheme } from 'next-themes'

// Third-party Imports
import { Toaster as Sonner } from 'sonner'

type ToasterProps = ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // Hooks
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className='toaster group'
      toastOptions={{
        classNames: {
          toast:
            'group toast items-start gap-4 rounded-md group-[.toaster]:border-transparent group-[.toaster]:shadow-md',
          default: 'plb-[14px] bg-card text-card-foreground',
          success:
            'bg-success !text-success-foreground [&[data-rich-colors="true"]]:!text-success [&[data-rich-colors="true"]]:!border-success/75 [&[data-rich-colors="true"]_[data-icon]]:ring-success/20 [&_[data-icon]]:ring-4 [&_[data-icon]]:ring-white/40 [&_svg]:text-success [&[data-rich-colors="true"]_[data-icon]]:bg-success [&[data-rich-colors="true"]_svg]:text-success-foreground',
          warning:
            'bg-warning !text-warning-foreground [&[data-rich-colors="true"]]:!text-warning [&[data-rich-colors="true"]]:!border-warning/75 [&[data-rich-colors="true"]_[data-icon]]:ring-warning/20 [&_[data-icon]]:ring-4 [&_[data-icon]]:ring-white/40 [&_svg]:text-warning [&[data-rich-colors="true"]_[data-icon]]:bg-warning [&[data-rich-colors="true"]_svg]:text-warning-foreground',
          info: 'bg-info !text-info-foreground [&[data-rich-colors="true"]]:!text-info [&[data-rich-colors="true"]]:!border-info/75 [&[data-rich-colors="true"]_[data-icon]]:ring-info/20 [&_[data-icon]]:ring-4 [&_[data-icon]]:ring-white/40 [&_svg]:text-info [&[data-rich-colors="true"]_[data-icon]]:bg-info [&[data-rich-colors="true"]_svg]:text-info-foreground',
          error:
            'bg-destructive !text-destructive-foreground [&[data-rich-colors="true"]]:!text-destructive [&[data-rich-colors="true"]]:!border-destructive/75 [&[data-rich-colors="true"]_[data-icon]]:ring-destructive/20 [&_[data-icon]]:ring-4 [&_[data-icon]]:ring-white/40 [&_svg]:text-destructive [&[data-rich-colors="true"]_[data-icon]]:bg-destructive [&[data-rich-colors="true"]_svg]:text-destructive-foreground',
          icon: 'flex items-center justify-center bg-card rounded-full bs-[26px] is-[26px] m-0 [&_svg]:text-lg [&_svg]:m-0',
          title: 'text-base font-normal',
          content: 'self-center',
          actionButton: '!bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: '!bg-transparent !text-current [&_svg]:!text-current [&_svg]:text-lg'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
