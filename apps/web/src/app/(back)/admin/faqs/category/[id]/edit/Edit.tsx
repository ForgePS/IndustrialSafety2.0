'use client'

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
import SubmitButton from '@repo/ui/components/SubmitButton'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'

// Component Imports
import { handleDelete } from '../../Categories'
import type { CategoryTypes } from '../../Categories'

// Define Zod Schema for validation
const categorySchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }),
  icon: z.string().refine(val => val in Icons, { message: 'Invalid icon name.' })
})

const Edit = ({ categoryData, id }: { categoryData: CategoryTypes; id: number }) => {
  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      title: categoryData?.title || '',
      icon: categoryData?.icon || ''
    }
  })

  const onSubmit = async (data: z.infer<typeof categorySchema>) => {
    const { error } = await supabase
      .from('faq_categories')
      .update({
        title: data.title,
        icon: data.icon
      })
      .eq('id', id)

    if (error) {
      console.error('Error updating category: ', error.message)
      toast('error', 'Error updating category: ' + error.message)

      return
    }

    toast('success', 'Category updated successfully')
    router.push('/admin/faqs/category')
    router.refresh()
  }

  return (
    <>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Edit FAQ Category</h2>
        <DeleteDialog
          handleDelete={async () => {
            await handleDelete(id)
            router.push('/admin/faqs/category')
            router.refresh()
          }}
        />
      </div>
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Savings...'>
              Save changes
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

export default Edit
