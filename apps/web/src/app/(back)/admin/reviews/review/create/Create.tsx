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
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Component Imports
import ReviewImage from './ReviewImage'

// Define Zod Schema for validation only on required fields
const reviewSchema = (t: TFunction) =>
  z.object({
    platform_id: z.number().min(1, { message: t('admin:reviewsCreatePlatformError') }),
    link: z.string().url({ message: t('admin:reviewsCreateLinkError') }),
    content: z.string().min(1, { message: t('admin:reviewsCreateContentError') }),
    username: z.string().min(1, { message: t('admin:reviewsCreateUsernameError') }),

    // Non-required fields can be optional without validation
    title: z.string().optional(),
    video_url: z.string().optional(),
    rating: z.number().optional(),
    is_featured: z.boolean().optional(),
    designation: z.string().optional(),
    country: z.string().optional(),
    avatar_image: z.string().optional().nullable()
  })

export type PlatformTypes = {
  id: number
  platform_name: string
  slug: string
}

const CreateReview = ({ platformsData }: { platformsData: PlatformTypes[] }) => {
  // States
  const [file, setFile] = useState<File | undefined>()
  const [selectedPlatform, setSelectedPlatform] = useState<{ id: number; slug: string } | null>(null)

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<ReturnType<typeof reviewSchema>>>({
    resolver: zodResolver(reviewSchema(t)),
    defaultValues: {
      title: '',
      platform_id: platformsData[0]?.id || 1,
      link: '',
      video_url: '',
      rating: 5,
      content: '',
      is_featured: false,
      username: '',
      designation: '',
      country: '',
      avatar_image: null
    }
  })

  // Form submission handler
  const onSubmit = async (data: z.infer<ReturnType<typeof reviewSchema>>) => {
    // Client-side Supabase insert function
    const { error } = await supabase.from('reviews').insert([
      {
        title: data.title,
        platform_id: data.platform_id,
        link: data.link,
        video_url: data.video_url,
        rating: data.rating,
        content: data.content,
        is_featured: data.is_featured,
        username: data.username,
        designation: data.designation,
        country: data.country,
        avatar_image: data.avatar_image
      }
    ])

    // Handle errors or navigate
    if (error) {
      console.error('Error creating review: ', error.message)
      toast('error', t('admin:reviewsCreateError', { message: error.message }))

      return
    }

    toast('success', t('admin:reviewsCreateSuccess'))

    // Redirect on success
    router.push('/admin/reviews/review')
    router.refresh()
  }

  // Create and create another review
  const createAndCreateReview = async (data: z.infer<ReturnType<typeof reviewSchema>>) => {
    // Client-side Supabase insert function
    const { error } = await supabase.from('reviews').insert([
      {
        title: data.title,
        platform_id: data.platform_id,
        link: data.link,
        video_url: data.video_url,
        rating: data.rating,
        content: data.content,
        is_featured: data.is_featured,
        username: data.username,
        designation: data.designation,
        country: data.country,
        avatar_image: data.avatar_image
      }
    ])

    // Handle errors or navigate
    if (error) {
      console.error('Error creating review: ', error.message)
      toast('error', t('admin:reviewsCreateError', { message: error.message }))

      return
    }

    toast('success', t('admin:reviewsCreateSuccess'))

    // Reset the form to its default values
    form.reset()
    form.setValue('rating', 5)
    setFile(undefined)
    router.refresh()
  }

  const handleImageUpload = (file: string) => {
    form.setValue('avatar_image', file)
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>
          <Trans i18nKey='admin:reviewsCreateTitle' />
        </h1>
      </div>
      <Form {...form}>
        <form>
          <div className='grid grid-cols-3 gap-6'>
            <Card className='col-span-full lg:col-span-2'>
              <CardHeader className='border-be'>
                <CardDescription className='font-medium'>
                  <Trans i18nKey='admin:reviewDetailsSection' />
                </CardDescription>
              </CardHeader>
              <CardContent className='pbs-6 grid gap-6 md:grid-cols-2'>
                <div className='flex flex-col items-start gap-2'>
                  <FormField
                    control={form.control}
                    name='title'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          <Trans i18nKey='admin:reviewsCreateTitleLabel' />
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('admin:reviewsCreateTitlePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='platform_id'
                    render={() => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          <Trans i18nKey='admin:reviewsCreatePlatformLabel' />
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Select
                            value={String(selectedPlatform?.id || platformsData[0]?.id)}
                            onValueChange={(value: string) => {
                              const platform = platformsData.find(p => p.id === Number(value))

                              if (platform) {
                                setSelectedPlatform(platform)
                                form.setValue('platform_id', Number(value))
                              }
                            }}
                          >
                            <SelectTrigger className='is-full'>
                              <SelectValue>
                                {selectedPlatform ? selectedPlatform.slug : t('admin:reviewsCreatePlatformPlaceholder')}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {platformsData.length > 0 ? (
                                platformsData.map(platform => (
                                  <SelectItem key={platform.id} value={String(platform.id)}>
                                    {platform.platform_name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value='none' disabled>
                                  <Trans i18nKey='admin:platformNotAvailable' />
                                </SelectItem>
                              )}
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
                          <Trans i18nKey='admin:reviewsCreateLinkLabel' />
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('admin:reviewsCreateLinkPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='video_url'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          <Trans i18nKey='admin:reviewsCreateVideoLabel' />
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('admin:reviewsCreateVideoPlaceholder')} {...field} />
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
                        <FormLabel>
                          <Trans i18nKey='admin:ratingsLabel' />
                        </FormLabel>
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
                          <Trans i18nKey='admin:reviewsCreateContentLabel' />
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Textarea rows={5} placeholder={t('admin:reviewsCreateContentPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='is_featured'
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className='flex items-center'>
                            <Switch
                              id='is-featured'
                              onCheckedChange={checked => form.setValue('is_featured', checked)}
                              checked={field.value}
                            />
                            <FormLabel className='mis-2 cursor-pointer' htmlFor='is-featured'>
                              <Trans i18nKey='admin:isFeaturedLabel' />
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
                <CardDescription className='font-medium'>
                  <Trans i18nKey='admin:reviewsCreateReviewerDetailsTitle' />
                </CardDescription>
              </CardHeader>
              <CardContent className='pbs-6 flex flex-col gap-6'>
                <FormField
                  control={form.control}
                  name='username'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans i18nKey='admin:reviewsCreateUsernameLabel' />
                        <sup className='text-destructive'>*</sup>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:reviewsCreateUsernamePlaceholder')} {...field} />
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
                      <FormLabel>
                        <Trans i18nKey='admin:reviewsCreateDesignationLabel' />
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:reviewsCreateDesignationPlaceholder')} {...field} />
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
                      <FormLabel>
                        <Trans i18nKey='admin:reviewsCreateCountryLabel' />
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:reviewsCreateCountryPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <ReviewImage onImageUpload={handleImageUpload} file={file} setFile={setFile} />
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <SubmitButton
                formAction={form.handleSubmit(onSubmit) as any}
                pendingText={<Trans i18nKey='admin:creatingStatus' />}
              >
                <Trans i18nKey='admin:createButton' />
              </SubmitButton>
              <SubmitButton
                formAction={form.handleSubmit(createAndCreateReview) as any}
                pendingText={<Trans i18nKey='admin:creatingStatus' />}
                variant='tonalDefault'
              >
                <Trans i18nKey='admin:createAndCreateAnotherButton' />
              </SubmitButton>
              <Button type='button' variant='tonalDefault' asChild>
                <Link href='/admin/reviews/review'>
                  <Trans i18nKey='admin:cancelButton' />
                </Link>
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default CreateReview
