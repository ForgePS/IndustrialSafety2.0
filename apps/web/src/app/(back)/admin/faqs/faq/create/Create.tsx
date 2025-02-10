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
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Switch } from '@repo/ui/components/ui/switch'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Component Imports
import DescriptionEditor from '../DescriptionEditor'

// Define Zod Schema for validation
const faqSchema = (t: TFunction) =>
  z.object({
    title: z.string().min(3, { message: t('admin:titleMinLengthError') }),
    description: z.string().min(1, { message: t('admin:descriptionRequiredError') }),
    category_id: z.number().min(1, { message: t('admin:categoryRequiredError') }),
    is_featured: z.boolean().optional()
  })

const Create = ({ categories }: { categories: { id: string; title: string }[] }) => {
  // States
  const [editorContent, setEditorContent] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; title: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<ReturnType<typeof faqSchema>>>({
    resolver: zodResolver(faqSchema(t)),
    defaultValues: {
      title: '',
      description: '',
      category_id: undefined,
      is_featured: false
    }
  })

  const onSubmit = (data: z.infer<ReturnType<typeof faqSchema>>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

      const { error } = await supabase.from('faqs').insert([
        {
          title: data.title,
          description: data.description,
          category_id: data.category_id,
          is_featured: data.is_featured
        }
      ])

      if (error) {
        console.error('Error creating faq: ', error.message)
        toast('error', t('admin:faqsCreateError', { message: error.message }))

        return
      }

      toast('success', t('admin:faqsCreateSuccess'))

      if (submitAction === 'createAndCreateAnother') {
        form.reset()
        setEditorContent('')
        setSelectedCategory(null)
      } else {
        router.push('/admin/faqs/faq')
        router.refresh()
      }
    })
  }

  // Editor Change Handler to set Editor Content and clear errors
  const handleEditorChange = (content: string) => {
    form.setValue('description', content)

    setEditorContent(content)
    form.clearErrors('description')
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:faqsCreateTitle' />
      </h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid gap-6'>
                <FormField
                  control={form.control}
                  name='title'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        <Trans i18nKey='admin:titleLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:faqTitlePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='description'
                  render={() => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        <Trans i18nKey='admin:descriptionLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <DescriptionEditor editorContent={editorContent} setEditorContent={handleEditorChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='category_id'
                  render={() => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        <Trans i18nKey='admin:categoryLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={selectedCategory?.id || ''} // Display category title, store id separately
                          onValueChange={value => {
                            const category = categories.find(cat => cat.id === value)

                            if (category) {
                              setSelectedCategory(category) // Set category title separately
                              form.setValue('category_id', Number(category.id)) // Store only category_id
                              form.clearErrors('category_id')
                            }
                          }}
                        >
                          <SelectTrigger className='is-full'>
                            <SelectValue>
                              {selectedCategory ? selectedCategory.title : t('admin:selectCategoryPlaceholder')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {categories.length > 0 ? (
                              categories.map(category => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.title}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value='none' disabled>
                                <Trans i18nKey='admin:faqCategoriesNotFound' />
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
                  name='is_featured'
                  render={({ field }) => (
                    <FormItem className='is-full flex items-center gap-3'>
                      <FormControl>
                        <Switch
                          id='is-featured'
                          checked={field.value}
                          onCheckedChange={check => form.setValue('is_featured', check)}
                        />
                      </FormControl>
                      <FormLabel htmlFor='is-featured'>
                        <Trans i18nKey='admin:isFeaturedLabel' />
                      </FormLabel>
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
            <Button type='button' variant='tonalDefault'>
              <Link href='/admin/faqs/faq'>
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
