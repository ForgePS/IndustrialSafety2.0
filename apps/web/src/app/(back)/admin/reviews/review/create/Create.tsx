'use client'

// React Imports
import { useState, useTransition } from 'react'
import type { BaseSyntheticEvent } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { TbX } from 'react-icons/tb'
import { removeImageFromSupabase, uploadImageToSupabase } from '@repo/supabase/clientHelpers'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { Input } from '@repo/ui/components/ui/input'
import { Ratings } from '@repo/ui/components/ui/ratings'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

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
    review_url: z.string().optional()
  })

export type PlatformTypes = {
  id: number
  platform_name: string
  slug: string
}

const CreateReview = ({ platformsData }: { platformsData: PlatformTypes[] }) => {
  // States
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [currentImageUrl, setCurrentImageUrl] = useState<string>('')
  const [selectedPlatform, setSelectedPlatform] = useState<{ id: number; slug: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    onDrop: async (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0]

      if (selectedFile) {
        setFile(selectedFile)
        setPreviewUrl(URL.createObjectURL(selectedFile))
      }
    }
  })

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
      review_url: ''
    }
  })

  // Form submission handler
  const onSubmit = (data: z.infer<ReturnType<typeof reviewSchema>>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

      let imageUrl = previewUrl || ''

      if (file) {
        const uploadedUrl = await uploadImageToSupabase(file)

        if (uploadedUrl) {
          imageUrl = uploadedUrl

          // If there's an old image, remove it
          if (currentImageUrl) await removeImageFromSupabase(currentImageUrl)
        } else {
          console.error('Image upload failed.')

          return
        }
      }

      // If the avatar is removed from the UI
      if (!previewUrl && currentImageUrl) {
        await removeImageFromSupabase(currentImageUrl)
        imageUrl = ''
      }

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
          review_url: imageUrl
        }
      ])

      // Handle errors or navigate
      if (error) {
        console.error('Error creating review: ', error.message)
        toast('error', t('admin:reviewsCreateError', { message: error.message }))

        return
      }

      // Update the current image URL
      setCurrentImageUrl(imageUrl)

      toast('success', t('admin:reviewsCreateSuccess'))

      if (submitAction === 'createAndCreateAnother') {
        form.reset()
        form.setValue('rating', 5)
        setFile(null)
        setPreviewUrl(null)
      } else {
        router.push('/admin/reviews/review')
        router.refresh()
      }
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:reviewsCreateTitle' />
      </h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
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
            <Card className='max-lg:col-span-full'>
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
                <div className='flex flex-col items-start gap-2'>
                  <Label htmlFor='reviewer-image'>
                    <Trans i18nKey='admin:reviewsCreateImageLabel' />
                  </Label>
                  <div
                    {...getRootProps({
                      className:
                        'dropzone select-none self-center bs-32 is-32 border rounded-full cursor-pointer relative'
                    })}
                  >
                    <input {...getInputProps()} id='reviewer-image' name='reviewer-image' />
                    {previewUrl ? (
                      <>
                        <img
                          alt='Reviewer Image'
                          className='single-file-image bs-full is-full rounded-full object-cover'
                          src={previewUrl}
                          width={126}
                          height={126}
                        />
                        <Button
                          variant='destructive'
                          size='icon'
                          type='button'
                          className='block-end-[76%] inline-end-1 !is-6 !bs-6 absolute rounded-full'
                          onClick={e => {
                            e.stopPropagation()
                            setFile(null)
                            setPreviewUrl(null)
                          }}
                        >
                          <TbX className='size-4' />
                        </Button>
                      </>
                    ) : (
                      <div className='bs-full flex flex-col items-center justify-center rounded-full p-3 text-center text-sm'>
                        <Trans i18nKey='admin:dragDropText' />{' '}
                        <span className='text-primary'>
                          <Trans i18nKey='admin:browseText' />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <Button type='submit' name='submitAction' value='create' disabled={pending}>
                {pending ? <Trans i18nKey='admin:creatingStatus' /> : <Trans i18nKey='admin:createButton' />}
              </Button>
              <Button
                type='submit'
                name='submitAction'
                variant='tonalDefault'
                value='createAndCreateAnother'
                disabled={pending}
              >
                {pending ? (
                  <Trans i18nKey='admin:creatingStatus' />
                ) : (
                  <Trans i18nKey='admin:createAndCreateAnotherButton' />
                )}
              </Button>
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
