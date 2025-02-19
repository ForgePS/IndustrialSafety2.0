'use client'

// React Imports
import { useTransition } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import * as Icons from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Button } from '@repo/ui/components/ui/button'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@repo/rbac/utils'
import type { TFunction } from 'i18next'

// Component Imports
import { handleDelete } from '../../Categories'
import type { CategoryTypes } from '../../Categories'

// Define Zod Schema for validation
const categorySchema = (t: TFunction) =>
  z.object({
    title: z.string().min(3, { message: t('admin:titleMinLengthError') }),
    icon: z.string().refine(val => val in Icons, { message: t('admin:invalidIconError') })
  })

const Edit = ({
  categoryData,
  id,
  userPermissions
}: {
  categoryData: CategoryTypes
  id: number
  userPermissions: string[]
}) => {
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
      title: categoryData?.title || '',
      icon: categoryData?.icon || ''
    }
  })

  const onSubmit = (data: z.infer<ReturnType<typeof categorySchema>>) => {
    startTransition(async () => {
      const { error } = await supabase
        .from('faq_categories')
        .update({
          title: data.title,
          icon: data.icon
        })
        .eq('id', id)

      if (error) {
        console.error('Error updating category: ', error.message)
        toast('error', t('admin:faqCategoriesEditError', { message: error.message }))

        return
      }

      toast('success', t('admin:faqCategoriesEditSuccess'))
      router.push('/admin/faqs/category')
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex flex-wrap gap-4 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='admin:faqCategoriesEditTitle' />
        </h1>
        {hasPermission(userPermissions, 'delete_faqs') && (
          <DeleteDialog
            handleDelete={async () => {
              await handleDelete(id, t)
              router.push('/admin/faqs/category')
              router.refresh()
            }}
            itemName='category'
          />
        )}
      </div>
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
                        <Input placeholder={t('admin:faqCategoriesEditTitlePlaceholder')} {...field} />
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
                        <Input placeholder={t('admin:faqCategoriesEditIconPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          <div className='mbs-6 flex gap-4 max-sm:flex-col'>
            <Button type='submit' disabled={pending}>
              {pending ? <Trans i18nKey='admin:savingStatus' /> : <Trans i18nKey='admin:saveChangesButton' />}
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

export default Edit
