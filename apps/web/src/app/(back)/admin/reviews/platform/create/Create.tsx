'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'

// Component Imports
import PlatformImage from './PlatformImage'

// Define Zod Schema for validation
const platformSchema = z.object({
  platform_name: z.string().min(1, { message: 'Platform name is required.' }),
  slug: z.string().optional(),
  logo: z.string().optional().nullable()
})

// Helper function to generate a slug from a string
export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const CreatePlatform = () => {
  // States
  const [file, setFile] = useState<File | undefined>()

  // Vars
  const supabase = createClient()
  const router = useRouter()

  // Form setup
  const form = useForm<z.infer<typeof platformSchema>>({
    resolver: zodResolver(platformSchema),
    defaultValues: {
      platform_name: '',
      slug: '',
      logo: null
    }
  })

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof platformSchema>) => {
    const { error } = await supabase.from('review_platforms').insert([
      {
        platform_name: data.platform_name,
        slug: generateSlug(data.slug?.trim() ? data.slug : data.platform_name),
        logo: data.logo
      }
    ])

    if (error) {
      console.error('Error creating platform: ', error.message)
      toast('error', 'Error creating platform: ' + error.message)

      return
    }

    toast('success', 'Platform created successfully')
    router.push('/admin/reviews/platform')
    router.refresh()
  }

  // Create and create another handler
  const createAndCreateAnother = async (data: z.infer<typeof platformSchema>) => {
    const { error } = await supabase.from('review_platforms').insert([
      {
        platform_name: data.platform_name,
        slug: data.slug || data.platform_name.toLowerCase().replace(/\s+/g, '-'),
        logo: data.logo
      }
    ])

    if (error) {
      console.error('Error creating platform: ', error.message)
      toast('error', 'Error creating platform: ' + error.message)

      return
    }

    toast('success', 'Platform created successfully')
    form.reset()
    setFile(undefined)
    router.refresh()
  }

  const handleImageUpload = (file: string) => {
    form.setValue('logo', file)
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Create Review Platform</h1>
      </div>
      <Form {...form}>
        <form>
          <div className='grid grid-cols-2 gap-6'>
            <Card className='col-span-full lg:col-span-2'>
              <CardHeader className='border-be'>
                <CardDescription className='font-medium'>Review Details</CardDescription>
              </CardHeader>
              <CardContent className='pbs-6 flex flex-col gap-6'>
                <div className='grid gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='platform_name'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          Platform Name
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder='Enter platform name' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='slug'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>Platform Slug</FormLabel>
                        <FormControl>
                          <Input placeholder='Enter platform slug' {...field} />
                        </FormControl>
                        <FormMessage />
                        <small className='text-muted-foreground'>Leave blank to auto-generate from name</small>
                      </FormItem>
                    )}
                  />
                  <div className='flex items-start max-sm:justify-center'>
                    <PlatformImage onImageUpload={handleImageUpload} file={file} setFile={setFile} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Creating...'>
                Create
              </SubmitButton>
              <SubmitButton
                formAction={form.handleSubmit(createAndCreateAnother) as any}
                pendingText='Creating...'
                variant='tonalDefault'
              >
                Create & create another
              </SubmitButton>
              <Button type='button' variant='tonalDefault' asChild>
                <Link href='/admin/reviews/platform'>Cancel</Link>
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default CreatePlatform
