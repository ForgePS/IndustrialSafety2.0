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
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Switch } from '@repo/ui/components/ui/switch'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'

// Component Imports
import DescriptionEditor from '../DescriptionEditor'

// Define Zod Schema for validation
const faqSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }),
  description: z.string().min(1, { message: 'Description is required.' }),
  categoryId: z.number().min(1, { message: 'Category is required.' }),
  isFeatured: z.boolean().optional()
})

const Create = ({ categories }: { categories: { id: string; title: string }[] }) => {
  // States
  const [editorContent, setEditorContent] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; title: string } | null>(null)

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof faqSchema>>({
    resolver: zodResolver(faqSchema),
    defaultValues: {
      title: '',
      description: '',
      categoryId: undefined,
      isFeatured: false
    }
  })

  const onSubmit = async (data: z.infer<typeof faqSchema>) => {
    const { error } = await supabase.from('faqs').insert([
      {
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        isFeatured: data.isFeatured
      }
    ])

    if (error) {
      console.error('Error creating faq: ', error.message)
      toast('error', 'Error creating faq: ' + error.message)

      return
    }

    toast('success', 'FAQ created successfully')
    router.push('/admin/faqs/faq')
    router.refresh()
  }

  // Form Submit Handler for Create & Create Another
  const createAndCreateSubmit = async (data: z.infer<typeof faqSchema>) => {
    const { error } = await supabase.from('faqs').insert([
      {
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        isFeatured: data.isFeatured
      }
    ])

    if (error) {
      console.error('Error creating faq: ', error.message)
      toast('error', 'Error creating faq: ' + error.message)

      return
    }

    toast('success', 'FAQ created successfully')

    form.reset()
    setEditorContent('')
    setSelectedCategory(null)
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
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Create an FAQ</h2>
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Creating...'>
              Create
            </SubmitButton>
            <SubmitButton
              variant='tonalDefault'
              formAction={form.handleSubmit(createAndCreateSubmit) as any}
              pendingText='Creating...'
            >
              Create & create another
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

export default Create
