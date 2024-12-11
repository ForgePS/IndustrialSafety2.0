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
import { Ratings } from '@repo/ui/components/ui/ratings'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'

// Component Imports
import ReviewImage from './ReviewImage'

// Define Zod Schema for validation only on required fields
const reviewSchema = z.object({
  platform: z.enum(['g2', 'twitter', 'trustpilot'], { required_error: 'Please select a review platform.' }),
  link: z.string().url({ message: 'Please enter a valid review link.' }),
  content: z.string().min(1, { message: 'Review text is required.' }),
  username: z.string().min(1, { message: 'Reviewer name is required.' }),

  // Non-required fields can be optional without validation
  title: z.string().optional(),
  videoUrl: z.string().optional(),
  rating: z.number().optional(),
  isFeatured: z.boolean().optional(),
  designation: z.string().optional(),
  country: z.string().optional(),
  avatarImage: z.string().optional().nullable()
})

const CreateReview = () => {
  // States
  const [file, setFile] = useState<File | undefined>()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      title: '',
      platform: 'g2',
      link: '',
      videoUrl: '',
      rating: 5,
      content: '',
      isFeatured: false,
      username: '',
      designation: '',
      country: '',
      avatarImage: null
    }
  })

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof reviewSchema>) => {
    // Client-side Supabase insert function
    const { error } = await supabase.from('reviews').insert([
      {
        title: data.title,
        platform: data.platform,
        link: data.link,
        videoUrl: data.videoUrl,
        rating: data.rating,
        content: data.content,
        isFeatured: data.isFeatured,
        username: data.username,
        designation: data.designation,
        country: data.country,
        avatarImage: data.avatarImage
      }
    ])

    // Handle errors or navigate
    if (error) {
      console.error('Error creating review: ', error.message)
      toast('error', 'Error creating review: ' + error.message)

      return
    }

    toast('success', 'Review created successfully')

    // Redirect on success
    router.push('/admin/reviews')
    router.refresh()
  }

  // Create and create another review
  const createAndCreateReview = async (data: z.infer<typeof reviewSchema>) => {
    // Client-side Supabase insert function
    const { error } = await supabase.from('reviews').insert([
      {
        title: data.title,
        platform: data.platform,
        link: data.link,
        videoUrl: data.videoUrl,
        rating: data.rating,
        content: data.content,
        isFeatured: data.isFeatured,
        username: data.username,
        designation: data.designation,
        country: data.country,
        avatarImage: data.avatarImage
      }
    ])

    // Handle errors or navigate
    if (error) {
      console.error('Error creating review: ', error.message)
      toast('error', 'Error creating review: ' + error.message)

      return
    }

    toast('success', 'Review created successfully')

    // Reset the form to its default values
    form.reset()
    form.setValue('rating', 5)
    setFile(undefined)
    router.refresh()
  }

  const handleImageUpload = (file: string) => {
    form.setValue('avatarImage', file)
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Create Review</h1>
      </div>
      <Form {...form}>
        <form>
          <div className='grid grid-cols-3 gap-6'>
            <Card className='col-span-full lg:col-span-2'>
              <CardHeader className='border-be'>
                <CardDescription className='font-medium'>Review Details</CardDescription>
              </CardHeader>
              <CardContent className='pbs-6 grid gap-6 md:grid-cols-2'>
                <div className='flex flex-col items-start gap-2'>
                  <FormField
                    control={form.control}
                    name='title'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>Review Title</FormLabel>
                        <FormControl>
                          <Input placeholder='Enter review title' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='platform'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          Review Platform
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={value => form.setValue('platform', value as any)}>
                            <SelectTrigger className='is-full'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='g2'>g2</SelectItem>
                              <SelectItem value='twitter'>Twitter</SelectItem>
                              <SelectItem value='trustpilot'>Trustpilot</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='link'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          Review Link
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder='Enter review link' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='videoUrl'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>Review Video URL</FormLabel>
                        <FormControl>
                          <Input placeholder='Enter video url' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className='flex flex-col gap-6'>
                  <FormField
                    control={form.control}
                    name='rating'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ratings</FormLabel>
                        <FormControl>
                          <Ratings
                            rating={typeof field.value === 'number' ? field.value : 5}
                            onRatingChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='content'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Review Text
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Textarea rows={5} placeholder='Enter review description' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='isFeatured'
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className='flex items-center'>
                            <Switch
                              id='is-featured'
                              onCheckedChange={checked => form.setValue('isFeatured', checked)}
                              checked={field.value}
                            />
                            <FormLabel className='mis-2 cursor-pointer' htmlFor='is-featured'>
                              Is Featured
                            </FormLabel>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='border-be'>
                <CardDescription className='font-medium'>Reviewer Details</CardDescription>
              </CardHeader>
              <CardContent className='pbs-6 flex flex-col gap-6'>
                <FormField
                  control={form.control}
                  name='username'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Reviewer Name
                        <sup className='text-destructive'>*</sup>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='Enter user name' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='designation'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reviewer Designation</FormLabel>
                      <FormControl>
                        <Input placeholder='Enter designation' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='country'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reviewer Location (Country Code)</FormLabel>
                      <FormControl>
                        <Input placeholder='IN, USA, UK, etc.' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <ReviewImage onImageUpload={handleImageUpload} file={file} setFile={setFile} />
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Creating...'>
                Create
              </SubmitButton>
              <SubmitButton
                formAction={form.handleSubmit(createAndCreateReview) as any}
                pendingText='Creating...'
                variant='tonalDefault'
              >
                Create & create another
              </SubmitButton>
              <Button type='button' variant='tonalDefault' asChild>
                <Link href='/admin/reviews'>Cancel</Link>
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default CreateReview
