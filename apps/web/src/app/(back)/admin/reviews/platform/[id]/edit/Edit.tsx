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
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@repo/rbac/utils'
import type { Database } from '@repo/supabase/types'
import type { TFunction } from 'i18next'

// Component Imports
import { deletePlatform } from '../../Platforms'
import { generateSlug } from '../../create/Create'

// Define Zod Schema for validation
const platformSchema = (t: TFunction) =>
  z.object({
    platform_name: z.string().min(1, { message: t('admin:platformNameRequiredError') }),
    slug: z.string().optional(),
    logo_url: z.string().optional()
  })

const EditPlatform = ({
  platformData,
  id,
  userPermissions
}: {
  platformData: Database['public']['Tables']['review_platforms']['Row']
  id: number
  userPermissions: string[]
}) => {
  // States
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(platformData.logo_url ?? '')
  const [currentImageUrl, setCurrentImageUrl] = useState(platformData.logo_url || '')
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

  // Form setup
  const form = useForm<z.infer<ReturnType<typeof platformSchema>>>({
    resolver: zodResolver(platformSchema(t)),
    defaultValues: {
      platform_name: platformData.platform_name || '',
      slug: platformData.slug || '',
      logo_url: platformData.logo_url ?? ''
    }
  })

  // Form submission handler
  const onSubmit = (data: z.infer<ReturnType<typeof platformSchema>>) => {
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

      const { data: urlData, error } = await supabase
        .from('review_platforms')
        .update({
          platform_name: data.platform_name,
          slug: generateSlug(data.slug?.trim() ? data.slug : data.platform_name),
          logo_url: imageUrl
        })
        .eq('id', id)
        .select()

      console.log('urlData', urlData)

      if (error) {
        console.error('Error updating platform: ', error.message)
        toast('error', t('admin:reviewPlatformsEditError', { message: error.message }))

        return
      }

      // Update the current image URL
      setCurrentImageUrl(imageUrl)

      toast('success', t('admin:reviewPlatformsEditSuccess'))
      router.push('/admin/reviews/platform')
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex flex-wrap gap-4 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='admin:reviewPlatformsEditTitle' />
        </h1>
        {hasPermission(userPermissions, 'delete_reviews') && (
          <DeleteDialog
            handleDelete={async () => {
              await deletePlatform(id, platformData.logo_url, t)
              router.push('/admin/reviews/platform')
              router.refresh()
            }}
            itemName='review-platform'
          />
        )}
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className='grid grid-cols-2 gap-6'>
            <Card className='col-span-full lg:col-span-2'>
              <CardHeader className='border-be'>
                <CardDescription className='font-medium'>
                  <Trans i18nKey='admin:reviewDetailsSection' />
                </CardDescription>
              </CardHeader>
              <CardContent className='pbs-6 flex flex-col gap-6'>
                <div className='grid gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='platform_name'
                    render={({ field }) => (
                      <FormItem className='is-full'>
                        <FormLabel>
                          <Trans i18nKey='admin:platformNameLabel' />
                          <sup className='text-destructive'>*</sup>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('admin:platformNamePlaceholder')} {...field} />
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
                        <FormLabel>
                          <Trans i18nKey='admin:platformSlugLabel' />
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('admin:platformSlugPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                        <small className='text-muted-foreground'>
                          <Trans i18nKey='admin:autoGenerateSlugHelp' />
                        </small>
                      </FormItem>
                    )}
                  />
                  <div className='flex items-start max-sm:justify-center'>
                    <div className='flex flex-col items-start gap-2'>
                      <Label htmlFor='reviewer-image'>
                        <Trans i18nKey='admin:platformImageLabel' />
                      </Label>
                      <div
                        {...getRootProps({
                          className:
                            'dropzone select-none self-center bs-32 is-32 border rounded-full cursor-pointer relative'
                        })}
                      >
                        <input {...getInputProps()} id='imageUrl' name='imageUrl' />
                        {previewUrl ? (
                          <>
                            <img
                              alt='Platform Logo'
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
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className='col-span-full flex gap-4 max-sm:flex-col'>
              <Button type='submit' disabled={pending}>
                {pending ? <Trans i18nKey='admin:savingStatus' /> : <Trans i18nKey='admin:saveButton' />}
              </Button>
              <Button type='button' variant='tonalDefault' asChild>
                <Link href='/admin/reviews/platform'>
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

export default EditPlatform
