'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
import SubmitButton from '@repo/ui/components/SubmitButton'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'

// Component Imports
import DescriptionEditor from '../../DescriptionEditor'
import { deleteFaq } from '../../Faq'
import type { FaqWithCategory } from '../../Faq'

// Define Zod Schema for validation
const faqSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }),
  description: z.string().min(1, { message: 'Description is required.' }),
  categoryId: z.number().min(1, { message: 'Category is required.' }),
  isFeatured: z.boolean().optional()
})

const Edit = ({
  faqData,
  id,
  categories
}: {
  faqData: FaqWithCategory
  id: number
  categories: { id: string; title: string }[]
}) => {
  // States
  const [editorContent, setEditorContent] = useState<string>(faqData?.description || '')

  const [selectedCategory, setSelectedCategory] = useState<{ id: string; title: string } | null>(
    faqData?.categoryId ? { id: String(faqData.categoryId), title: faqData.faq_categories?.title || '' } : null
  )

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof faqSchema>>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      title: faqData?.title || '',
      description: faqData?.description || '',
      categoryId: faqData?.categoryId ? Number(faqData.categoryId) : undefined,
      isFeatured: faqData?.isFeatured || false
    }
  })

  const onSubmit = async (data: z.infer<typeof faqSchema>) => {
    const { error } = await supabase
      .from('faqs')
      .update({
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        isFeatured: data.isFeatured
      })
      .eq('id', id)

    if (error) {
      console.error('Error updating faq: ', error.message)
      toast('error', 'Error updating faq: ' + error.message)

      return
    }

    toast('success', 'FAQ updated successfully')
    router.push('/admin/faqs/faq')
    router.refresh()
  }

  // Editor Change Handler to set Editor Content and clear errors
  const handleEditorChange = (content: string) => {
    form.setValue('description', content)
    setEditorContent(content)
    form.clearErrors('description')
  }

  return (
    <>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Edit an FAQ</h2>
        <DeleteDialog
          handleDelete={async () => {
            await deleteFaq(id)
            router.push('/admin/faqs/faq')
            router.refresh()
          }}
        />
      </div>
      <Form {...form}>
        <form>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid gap-6'>
                <FormField
                  control={form.control}
                  name='title'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        Title<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='Enter review title' {...field} />
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
                        Description<span className='text-destructive'>*</span>
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
                  name='categoryId'
                  render={() => (
                    <FormItem className='is-full'>
                      <FormLabel>
                        Category<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={selectedCategory?.id || ''} // Display category title, store id separately
                          onValueChange={value => {
                            const category = categories.find(cat => cat.id === value)

                            if (category) {
                              setSelectedCategory(category) // Set category title separately
                              form.setValue('categoryId', Number(category.id)) // Store only categoryId
                              form.clearErrors('categoryId')
                            }
                          }}
                        >
                          <SelectTrigger className='is-full'>
                            <SelectValue>{selectedCategory ? selectedCategory.title : 'Select a category'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(category => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='isFeatured'
                  render={({ field }) => (
                    <FormItem className='is-full flex items-center gap-3'>
                      <FormControl>
                        <Switch
                          id='is-featured'
                          checked={field.value}
                          onCheckedChange={check => form.setValue('isFeatured', check)}
                        />
                      </FormControl>
                      <FormLabel htmlFor='is-featured'>Is Featured</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          <div className='mbs-6 flex justify-start gap-4'>
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Saving...'>
              Save changes
            </SubmitButton>
            <Button type='button' variant='tonalDefault'>
              <Link href='/admin/faqs/faq'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Edit
