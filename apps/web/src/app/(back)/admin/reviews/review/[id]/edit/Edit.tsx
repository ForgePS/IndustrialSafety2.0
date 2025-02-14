'use client'

// React Imports
import { useState, useTransition } from 'react'

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
import type { Database } from '@repo/supabase/types'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Ratings } from '@repo/ui/components/ui/ratings'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { toast } from '@repo/ui/utils/toast'
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@repo/rbac/utils'
import type { TFunction } from 'i18next'

// Component Imports
import { deleteReview } from '../../Reviews'
import type { PlatformTypes } from '../../create/Create'

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
    review_url: z.string().optional().nullable()
  })

type EditReviewProps = {
  reviewData: Database['public']['Tables']['reviews']['Row']
  platformsData: PlatformTypes[]
  id: number
  userPermissions: string[]
}

const EditReview = ({ reviewData, platformsData, id, userPermissions }: EditReviewProps) => {
  // States
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(reviewData.review_url ?? '')
  const [currentImageUrl, setCurrentImageUrl] = useState<string>(reviewData.review_url ?? '')
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
      title: reviewData.title || '',
      platform_id: reviewData.platform_id || undefined,
      link: reviewData.link,
      video_url: reviewData.video_url || '',
      rating: reviewData.rating,
      content: reviewData.content,
      is_featured: reviewData.is_featured,
      username: reviewData.username,
      designation: reviewData.designation || '',
      country: reviewData.country || '',
      review_url: reviewData.review_url || ''
    }
  })

  // Form submission handler
  const onSubmit = (data: z.infer<ReturnType<typeof reviewSchema>>) => {
    startTransition(async () => {
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
      const { error } = await supabase
        .from('reviews')
        .update({
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
        })
        .eq('id', id)

      // Handle errors or navigate
      if (error) {
        console.error('Error updating review: ', error.message)
        toast('error', t('admin:reviewsEditError', { message: error.message }))

        return
      }

      // Update the current image URL
      setCurrentImageUrl(imageUrl)

      toast('success', t('admin:reviewsEditSuccess'))

      // Redirect on success
      router.push('/admin/reviews/review')
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex flex-wrap gap-4 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='admin:reviewsEditTitle' />
        </h1>
        {hasPermission(userPermissions, 'delete_reviews') && (
          <DeleteDialog
            handleDelete={async () => {
              await deleteReview(id, reviewData.review_url, t)
              router.push('/admin/reviews/review')
              router.refresh()
            }}
            itemName='review'
          />
        )}
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <section className='grid grid-cols-3 gap-6'>
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
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          <Trans i18nKey='admin:reviewsCreatePlatformLabel' />
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Select
                            value={field.value ? String(field.value) : ''}
                            onValueChange={value => field.onChange(Number(value))}
                          >
                            <SelectTrigger className='is-full'>
                              <SelectValue placeholder={t('admin:reviewsCreatePlatformPlaceholder')} />
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
                            rating={field.value || 5}
                            onRatingChange={rating => form.setValue('rating', rating)}
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
                      <>
                        <div className='bs-full flex flex-col items-center justify-center rounded-full p-3 text-center text-sm'>
                          <Trans i18nKey='admin:dragDropText' />{' '}
                          <span className='text-primary'>
                            <Trans i18nKey='admin:browseText' />
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <Button type='submit' disabled={pending}>
                {pending ? <Trans i18nKey='admin:savingStatus' /> : <Trans i18nKey='admin:saveChangesButton' />}
              </Button>
              <Button type='button' variant='tonalDefault' asChild>
                <Link href='/admin/reviews/review'>
                  <Trans i18nKey='admin:cancelButton' />
                </Link>
              </Button>
            </div>
          </section>
        </form>
      </Form>
    </div>
  )
}

export default EditReview
