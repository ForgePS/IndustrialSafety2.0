'use client'

// Third-party Imports
import { toast } from 'sonner'
import { TbTrash, TbX } from 'react-icons/tb'
import * as Icons from 'react-icons/tb'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@repo/ui/components/ui/table'
import { Input } from '@repo/ui/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@repo/ui/components/ui/form'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { Button } from '@repo/ui/components/ui/button'
import { CardContent } from '@repo/ui/components/ui/card'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Define Zod Schema for validation
const socialLinksSchema = (t: TFunction) =>
  z.object({
    social_links: z.array(
      z.object({
        title: z.string().min(1, { message: t('admin:settingsSocialLinksTitleError') }),
        icon: z.string().refine(val => val in Icons, { message: t('admin:invalidIconError') }),
        url: z.string().url({ message: t('admin:settingsSocialLinksUrlError') })
      })
    )
  })

const SocialLinks = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // Vars
  const supabase = createClient()

  // Hooks
  const { t } = useTranslation()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<ReturnType<typeof socialLinksSchema>>>({
    resolver: zodResolver(socialLinksSchema(t)),
    defaultValues: {
      social_links: settings.social_links || []
    }
  })

  const { control } = form

  // Handle dynamic form fields array
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'social_links'
  })

  // To add a new social link row
  const addSocialLink = () => {
    append({ title: '', icon: '', url: '' })
  }

  const onSubmit = async (data: z.infer<ReturnType<typeof socialLinksSchema>>) => {
    const updatedSocialLinks = {
      social_links: data.social_links
    }

    const { error } = await supabase
      .from('settings_configuration')
      .update({
        value: JSON.stringify({
          ...settings,
          ...updatedSocialLinks
        })
      })
      .eq('key', 'general_settings')

    if (error) {
      console.error('Error updating social links: ', error.message)
      toast.error(
        <Trans
          i18nKey='admin:settingsSocialLinksUpdateError'
          values={{
            message: error.message
          }}
        />
      )

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

  // Handle Delete Social Link
  const handleDeleteSocialLink = async (id: number) => {
    const existingSocialLinks = (settings.social_links || []).filter((_, index) => index !== id)

    const { error } = await supabase
      .from('settings_configuration')
      .update({
        value: JSON.stringify({
          ...settings,
          social_links: existingSocialLinks
        })
      })
      .eq('key', 'general_settings')

    if (error) {
      console.error('Error deleting social link: ', error.message)
      toast.error(
        <Trans
          i18nKey='admin:settingsSocialLinksDeleteError'
          values={{
            message: error.message
          }}
        />
      )

      return
    }

    remove(id)

    toast.success(<Trans i18nKey='admin:settingsSocialLinksDeleteSuccess' />, {
      dismissible: true,
      icon: <TbTrash className='size-6' />,
      duration: 3000
    })
  }

  return (
    <CardContent className='pbs-6'>
      <h1 className='mbs-6 mbe-2 text-textPrimary text-sm font-medium'>
        <Trans i18nKey='admin:socialLinksSection' />
      </h1>
      <Form {...form}>
        <form>
          <div className='overflow-x-auto rounded-md border'>
            <Table className='min-is-[800px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='text-left'>
                    <Trans i18nKey='admin:titleLabel' />
                  </TableHead>
                  <TableHead className='text-left'>
                    <Trans i18nKey='admin:settingsSocialLinksTableIconColumn' />
                  </TableHead>
                  <TableHead className='text-left'>
                    <Trans i18nKey='admin:settingsSocialLinksTableUrlColumn' />
                  </TableHead>
                  <TableHead className='md:is-[80px]'></TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className='[&>tr]:last:border-be-0'>
                {fields.map((provider, index) => (
                  <TableRow key={provider.id} className='!bg-transparent'>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`social_links.${index}.title`}
                        render={({ field }) => (
                          <FormItem className='is-full'>
                            <FormControl>
                              <Input placeholder={t('admin:settingsSocialLinksTitlePlaceholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`social_links.${index}.icon`}
                        render={({ field }) => (
                          <FormItem className='is-full'>
                            <FormControl>
                              <Input placeholder={t('admin:settingsSocialLinksIconPlaceholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`social_links.${index}.url`}
                        render={({ field }) => (
                          <FormItem className='is-full'>
                            <FormControl>
                              <Input placeholder={t('admin:settingsSocialLinksUrlPlaceholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='text-destructive flex items-center justify-center'
                        onClick={() => handleDeleteSocialLink(index)}
                      >
                        <TbTrash />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='is-full mbs-4 flex items-center justify-center gap-4 max-sm:flex-col'>
            <Button type='button' variant='tonalDefault' onClick={addSocialLink} className='max-sm:is-full'>
              <Trans i18nKey='admin:settingsSocialLinksAddButton' />
            </Button>
            <SubmitButton
              formAction={form.handleSubmit(onSubmit) as any}
              className='max-sm:is-full'
              pendingText={<Trans i18nKey='admin:settingsApplicationSavingChanges' />}
            >
              <Trans i18nKey='admin:settingsSaveChanges' />
            </SubmitButton>
          </div>
        </form>
      </Form>
    </CardContent>
  )
}

export default SocialLinks
