'use client'

// Third-party Imports
import { toast } from 'sonner'
import { TbTrash, TbX } from 'react-icons/tb'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'
import { CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@repo/ui/components/ui/table'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { Button } from '@repo/ui/components/ui/button'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'

// Define Zod Schema for validation
const trackingSchema = z.object({
  google_tag_manager: z.string().min(1, { message: 'Google Tag Manager ID required' }),
  providers: z.array(
    z.object({
      name: z.string().min(1, { message: 'Provider name required' }),
      snippet: z
        .string()
        .min(1, { message: 'Snippet required' })
        .refine(
          value => {
            const validSnippetRegex = /(<!--.*?-->\s*)?<script.*?>.*?<\/script>/is

            return validSnippetRegex.test(value)
          },
          {
            message: 'Snippet must contain a valid <script> tag, and can include comments'
          }
        )
    })
  )
})

const Tracking = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // Vars
  const supabase = createClient()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof trackingSchema>>({
    resolver: zodResolver(trackingSchema),
    defaultValues: {
      google_tag_manager: settings.tracking.google_tag_manager || '',
      providers: settings.tracking.providers || []
    }
  })

  const { control } = form

  // Handle dynamic form fields array
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'providers'
  })

  // Add a new provider row
  const addProvider = () => {
    append({
      name: '',
      snippet: ''
    })
  }

  const onSubmit = async (data: z.infer<typeof trackingSchema>) => {
    const updatedTracking = {
      google_tag_manager: data.google_tag_manager,
      providers: data.providers
    }

    const { error } = await supabase
      .from('settings_configuration')
      .update({
        value: JSON.stringify({
          ...settings,
          tracking: updatedTracking
        })
      })
      .eq('key', 'general_settings')

    if (error) {
      console.error('Error updating settings: ', error.message)
      toast.error('Error updating settings: ' + error.message)

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

  // Handle Delete Provider
  const handleDeleteProvider = async (index: number) => {
    const updatedProviders = (settings.tracking.providers || []).filter((_: any, i: number) => i !== index)

    const { error } = await supabase
      .from('settings_configuration')
      .update({
        value: JSON.stringify({
          ...settings,
          tracking: {
            google_tag_manager: settings.tracking.google_tag_manager,
            providers: updatedProviders
          }
        })
      })
      .eq('key', 'general_settings')

    if (error) {
      console.error('Error deleting provider: ', error.message)
      toast.error('Error deleting provider: ' + error.message)

      return
    }

    remove(index)

    toast.success('Provider deleted successfully', {
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
          <FormField
            control={form.control}
            name='google_tag_manager'
            render={({ field }) => (
              <FormItem className='is-full'>
                <FormLabel>Google Tag Manager ID</FormLabel>
                <FormControl>
                  <Input placeholder='GTM-XXXXXX' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <h1 className='mbs-6 mbe-2 text-textPrimary text-sm font-medium'>Tracking</h1>
          <div className='overflow-x-auto rounded-md border'>
            <Table className='min-is-[700px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='text-left'>Name</TableHead>
                  <TableHead className='text-left'>Snippet</TableHead>
                  <TableHead className='md:is-[80px]'></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className='[&>tr]:last:border-be-0'>
                {fields.map((provider, index) => (
                  <TableRow key={provider.id} className='!bg-transparent'>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`providers.${index}.name`}
                        render={({ field }) => (
                          <FormItem className='is-full'>
                            <FormControl>
                              <Input placeholder='Enter provider name' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`providers.${index}.snippet`}
                        render={({ field }) => (
                          <FormItem className='is-full'>
                            <FormControl>
                              <Textarea placeholder='Enter snippet' {...field} />
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
                        onClick={() => handleDeleteProvider(index)}
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
            <Button type='button' variant='tonalDefault' onClick={addProvider} className='max-sm:is-full'>
              Add to Tracking
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

export default Tracking
