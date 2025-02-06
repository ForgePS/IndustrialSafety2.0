'use client'

// React Imports
import { useTransition } from 'react'

// Third-party Imports
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { Button } from '@repo/ui/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from '@repo/ui/utils/toast'

// Define Zod Schema for validation
const applicationSchema = (t: TFunction) =>
  z.object({
    site_name: z.string().min(1, { message: t('admin:settingsApplicationSiteNameError') }),
    title: z.string().optional(),
    support_email: z.string().email({ message: t('admin:settingsApplicationSupportEmailError') }),
    description: z.string().optional()
  })

const Application = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // States
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const { t } = useTranslation()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<ReturnType<typeof applicationSchema>>>({
    resolver: zodResolver(applicationSchema(t)),
    defaultValues: {
      site_name: settings.application.site_name || '',
      title: settings.application.title || '',
      support_email: settings.application.support_email || '',
      description: settings.application.description || ''
    }
  })

  const onSubmit = (data: z.infer<ReturnType<typeof applicationSchema>>) => {
    startTransition(async () => {
      const { error } = await supabase
        .from('settings_configuration')
        .update({
          value: JSON.stringify({
            ...settings,
            application: {
              site_name: data.site_name,
              title: data.title,
              support_email: data.support_email,
              description: data.description
            }
          })
        })
        .eq('key', 'general_settings')

      if (error) {
        console.error('Error saving settings: ', error.message)
        toast('error', t('admin:settingsToastError', { message: error.message }))

        return
      }

      toast('success', t('admin:settingsToastSuccess'))
    })
  }

  return (
    <CardContent className='pbs-4'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className='grid grid-cols-2 gap-6'>
            <FormField
              control={form.control}
              name='site_name'
              render={({ field }) => (
                <FormItem className='max-md:col-span-full'>
                  <FormLabel>
                    <Trans i18nKey='admin:settingsApplicationSiteNameLabel' />
                    <span className='text-destructive'>*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('admin:settingsApplicationSiteNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='support_email'
              render={({ field }) => (
                <FormItem className='max-md:col-span-full'>
                  <FormLabel>
                    <Trans i18nKey='admin:settingsApplicationSupportEmailLabel' />
                    <span className='text-destructive'>*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('admin:settingsApplicationSupportEmailPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem className='max-md:col-span-full'>
                  <FormLabel>
                    <Trans i18nKey='admin:titleLabel' />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder={t('admin:settingsApplicationTitlePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem className='max-md:col-span-full'>
                  <FormLabel>
                    <Trans i18nKey='admin:descriptionLabel' />
                  </FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('admin:settingsApplicationDescriptionPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type='submit' disabled={pending} className='mbs-6 max-sm:is-full'>
            {pending ? (
              <Trans i18nKey='admin:settingsApplicationSavingChanges' />
            ) : (
              <Trans i18nKey='admin:settingsSaveChanges' />
            )}
          </Button>
        </form>
      </Form>
    </CardContent>
  )
}

export default Application
