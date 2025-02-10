'use client'

// React Imports
import { useTransition } from 'react'
import type { BaseSyntheticEvent } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as Icons from 'react-icons/tb'
import { z } from 'zod'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Define Zod Schema for validation
const categorySchema = (t: TFunction) =>
  z.object({
    title: z.string().min(3, { message: t('admin:titleMinLengthError') }),
    icon: z.string().refine(val => val in Icons, { message: t('admin:invalidIconError') })
  })

const Create = () => {
  // States
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<ReturnType<typeof categorySchema>>>({
    resolver: zodResolver(categorySchema(t)),
    defaultValues: {
      title: '',
      icon: ''
    }
  })

  const onSubmit = (data: z.infer<ReturnType<typeof categorySchema>>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

      const { error } = await supabase.from('faq_categories').insert([
        {
          title: data.title,
          icon: data.icon
        }
      ])

      if (error) {
        console.error('Error creating category: ', error.message)
        toast('error', t('admin:faqCategoriesCreateError', { message: error.message }))

        return
      }

      toast('success', t('admin:faqCategoriesCreateSuccess'))

      if (submitAction === 'createAndCreateAnother') {
        form.reset()
      } else {
        router.push('/admin/faqs/category')
      }

      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:faqCategoriesCreateTitle' />
      </h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='title'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        <Trans i18nKey='admin:categoryLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:faqCategoriesCreateNamePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='icon'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        <Trans i18nKey='admin:faqCategoriesIconLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:faqCategoriesCreateIconPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          <div className='mbs-6 flex gap-4 max-sm:flex-col'>
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
              <Link href='/admin/faqs/category'>
                <Trans i18nKey='admin:cancelButton' />
              </Link>
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default Create
