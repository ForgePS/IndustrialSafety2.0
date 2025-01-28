'use client'

// Third-party Imports
import { toast } from 'sonner'
import { TbX } from 'react-icons/tb'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Define Zod Schema for validation
const applicationSchema = (t: TFunction) =>
  z.object({
    site_name: z.string().min(1, { message: t('admin:settingsApplicationSiteNameError') }),
    title: z.string().optional(),
    support_email: z.string().email({ message: t('admin:settingsApplicationSupportEmailError') }),
    description: z.string().optional()
  })

const Application = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
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

  const onSubmit = async (data: z.infer<ReturnType<typeof applicationSchema>>) => {
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
      toast.error('Error saving settings: ' + error.message)

      return
    }

    toast.success(<Trans i18nKey='admin:settingsToastSuccess' />, {
      cancel: {
        label: <TbX />,
        onClick: () => {}
      },
      duration: 2000
    })
  }

  return (
    <CardContent className='pbs-6'>
      <Form {...form}>
        <form>
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
          <SubmitButton
            formAction={form.handleSubmit(onSubmit) as any}
            className='mbs-6 max-sm:is-full'
            pendingText={<Trans i18nKey='admin:settingsApplicationSavingChanges' />}
          >
            <Trans i18nKey='admin:settingsSaveChanges' />
          </SubmitButton>
        </form>
      </Form>
    </CardContent>
  )
}

export default Application
