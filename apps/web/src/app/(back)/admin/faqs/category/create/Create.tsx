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

// Define Zod Schema for validation
const categorySchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }),
  icon: z.string().refine(val => val in Icons, { message: 'Invalid icon name.' })
})

const Create = () => {
  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      title: '',
      icon: ''
    }
  })

  // Form Submit Handler
  const onSubmit = async (data: z.infer<typeof categorySchema>) => {
    const { error } = await supabase.from('faq_categories').insert([
      {
        title: data.title,
        icon: data.icon
      }
    ])

    if (error) {
      console.error('Error creating category: ', error.message)
      toast('error', 'Error creating category: ' + error.message)

      return
    }

    toast('success', 'Category created successfully')
    router.push('/admin/faqs/category')
    router.refresh()
  }

  // Form Submit Handler for Create & Create Another
  const createAndCreateSubmit = async (data: z.infer<typeof categorySchema>) => {
    const { error } = await supabase.from('faq_categories').insert([
      {
        title: data.title,
        icon: data.icon
      }
    ])

    if (error) {
      console.error('Error creating category: ', error.message)
      toast('error', 'Error creating category: ' + error.message)

      return
    }

    toast('success', 'Category created successfully')
    form.reset()
    router.refresh()
  }

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Create FAQ Category</h2>
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
                        Category<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='Enter faq category' {...field} />
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
                        Table Icon Name<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='Enter table icon name' {...field} />
                      </FormControl>
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
            <SubmitButton formAction={form.handleSubmit(createAndCreateSubmit) as any} variant='tonalDefault'>
              Create & create another
            </SubmitButton>
            <Button type='button' variant='tonalDefault'>
              <Link href='/admin/faqs/category'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Create
