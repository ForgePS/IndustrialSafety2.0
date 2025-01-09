'use client'

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
import type { Database } from '@repo/supabase/types'
import DeleteDialog from '@repo/ui/components/DeleteDialog'

// Component Imports
import PlatformImage from './PlatformImage'
import { deletePlatform } from '../../Platforms'
import { generateSlug } from '../../create/Create'

// Define Zod Schema for validation
const platformSchema = z.object({
  platform_name: z.string().min(1, { message: 'Platform name is required.' }),
  slug: z.string().optional(),
  logo: z.string().optional().nullable()
})

const EditPlatform = ({
  platformData,
  id
}: {
  platformData: Database['public']['Tables']['review_platforms']['Row']
  id: number
}) => {
  // Vars
  const supabase = createClient()
  const router = useRouter()

  // Form setup
  const form = useForm<z.infer<typeof platformSchema>>({
    resolver: zodResolver(platformSchema),
    defaultValues: {
      platform_name: platformData.platform_name || '',
      slug: platformData.slug || '',
      logo: platformData.logo || null
    }
  })

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof platformSchema>) => {
    const { error } = await supabase
      .from('review_platforms')
      .update({
        platform_name: data.platform_name,
        slug: generateSlug(data.slug?.trim() ? data.slug : data.platform_name),
        logo: data.logo
      })
      .eq('id', id)

    if (error) {
      console.error('Error creating platform: ', error.message)
      toast('error', 'Error creating platform: ' + error.message)

      return
    }

    toast('success', 'Platform created successfully')
    router.push('/admin/reviews/platform')
    router.refresh()
  }

  const handleImageUpload = (file: string) => {
    form.setValue('logo', file)
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-3xl font-bold'>Create Review Platform</h1>
        <DeleteDialog
          handleDelete={async () => {
            await deletePlatform(id)
            router.push('/admin/reviews/platform')
            router.refresh()
          }}
          itemName='review-platform'
        />
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
                    <PlatformImage onImageUpload={handleImageUpload} defaultImage={platformData.logo || ''} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Saving...'>
                Save
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

export default EditPlatform
