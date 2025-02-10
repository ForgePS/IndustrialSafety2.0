'use client'

// React Imports
import { useState, useTransition } from 'react'
import type { BaseSyntheticEvent } from 'react'

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
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Component Imports
import PlatformImage from './PlatformImage'

// Define Zod Schema for validation
const platformSchema = (t: TFunction) =>
  z.object({
    platform_name: z.string().min(1, { message: t('admin:platformNameRequiredError') }),
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
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // Form setup
  const form = useForm<z.infer<ReturnType<typeof platformSchema>>>({
    resolver: zodResolver(platformSchema(t)),
    defaultValues: {
      platform_name: '',
      slug: '',
      logo: null
    }
  })

  // Form submission handler
  const onSubmit = (data: z.infer<ReturnType<typeof platformSchema>>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

      const { error } = await supabase.from('review_platforms').insert([
        {
          platform_name: data.platform_name,
          slug: generateSlug(data.slug?.trim() ? data.slug : data.platform_name),
          logo: data.logo
        }
      ])

      if (error) {
        console.error('Error creating platform: ', error.message)
        toast('error', t('admin:reviewPlatformsCreateError', { message: error.message }))

        return
      }

      toast('success', t('admin:reviewPlatformsCreateSuccess'))

      if (submitAction === 'createAndCreateAnother') {
        form.reset()
        setFile(undefined)
      } else {
        router.push('/admin/reviews/platform')
        router.refresh()
      }
    })
  }

  const handleImageUpload = (file: string) => {
    form.setValue('logo', file)
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:reviewPlatformsCreateTitle' />
      </h1>
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
                    <PlatformImage onImageUpload={handleImageUpload} file={file} setFile={setFile} />
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

export default CreatePlatform
