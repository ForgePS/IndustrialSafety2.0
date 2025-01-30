'use client'

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
import SubmitButton from '@repo/ui/components/SubmitButton'
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

  // Form Submit Handler
  const onSubmit = async (data: z.infer<ReturnType<typeof categorySchema>>) => {
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
    router.push('/admin/faqs/category')
    router.refresh()
  }

  // Form Submit Handler for Create & Create Another
  const createAndCreateSubmit = async (data: z.infer<ReturnType<typeof categorySchema>>) => {
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
    form.reset()
    router.refresh()
  }

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>
        <Trans i18nKey='admin:faqCategoriesCreateTitle' />
      </h2>
      <Form {...form}>
        <form>
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
          <div className='mbs-6 flex justify-start gap-4'>
            <SubmitButton
              formAction={form.handleSubmit(onSubmit) as any}
              pendingText={<Trans i18nKey='admin:creatingStatus' />}
            >
              <Trans i18nKey='admin:createButton' />
            </SubmitButton>
            <SubmitButton formAction={form.handleSubmit(createAndCreateSubmit) as any} variant='tonalDefault'>
              <Trans i18nKey='admin:createAndCreateAnotherButton' />
            </SubmitButton>
            <Button type='button' variant='tonalDefault' asChild>
              <Link href='/admin/faqs/category'>
                <Trans i18nKey='admin:cancelButton' />
              </Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Create
