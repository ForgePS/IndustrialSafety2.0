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

// Define Zod Schema for validation
const socialLinksSchema = z.object({
  social_links: z.array(
    z.object({
      title: z.string().min(1, { message: 'Title must be at least 1 characters.' }),
      icon: z.string().refine(val => val in Icons, { message: 'Invalid icon name.' }),
      url: z.string().url({ message: 'Invalid URL' })
    })
  )
})

const SocialLinks = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // Vars
  const supabase = createClient()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof socialLinksSchema>>({
    resolver: zodResolver(socialLinksSchema),
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

  const onSubmit = async (data: z.infer<typeof socialLinksSchema>) => {
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
      toast.error('Error updating social links: ' + error.message)

      return
    }

    toast.success('Settings saved!', {
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
      toast.error('Error deleting social link: ' + error.message)

      return
    }

    remove(id)

    toast.success('Social Link deleted successfully', {
      dismissible: true,
      icon: <TbTrash className='size-6' />,
      duration: 3000
    })
  }

  return (
    <CardContent className='pbs-6'>
      <h1 className='mbs-6 mbe-2 text-textPrimary text-sm font-medium'>Social Links</h1>
      <Form {...form}>
        <form>
          <div className='overflow-x-auto rounded-md border'>
            <Table className='min-is-[800px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='text-left'>Title</TableHead>
                  <TableHead className='text-left'>Tabler Icon</TableHead>
                  <TableHead className='text-left'>URL</TableHead>
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
                              <Input placeholder='Enter social link title' {...field} />
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
                              <Input placeholder='Enter Tabler social Icon' {...field} />
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
                              <Input placeholder='Enter social link URL' {...field} />
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
              Add to social links
            </Button>
            <SubmitButton
              formAction={form.handleSubmit(onSubmit) as any}
              className='max-sm:is-full'
              pendingText='Saving Changes...'
            >
              Save Changes
            </SubmitButton>
          </div>
        </form>
      </Form>
    </CardContent>
  )
}

export default SocialLinks
