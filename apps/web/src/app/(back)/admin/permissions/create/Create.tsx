'use client'

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import SubmitButton from '@repo/ui/components/SubmitButton'

// Define Zod Schema for validation
const permissionSchema = z.object({
  permission: z.string().min(1, { message: 'Permission name is required.' })
})

const Create = () => {
  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // Form setup
  const form = useForm<z.infer<typeof permissionSchema>>({
    resolver: zodResolver(permissionSchema),
    defaultValues: {
      permission: ''
    }
  })

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof permissionSchema>) => {
    try {
      const { error } = await supabase.from('permissions').insert([
        {
          permission: data.permission
        }
      ])

      if (error) {
        if (error.code === '23505') {
          toast('error', 'This permission already exists')

          return
        }

        throw error
      }

      toast('success', 'Permission created successfully')
      router.push('/admin/permissions')
      router.refresh()
    } catch (error: any) {
      toast('error', 'Error creating permission: ' + error.message)
    }
  }

  // Create and create another handler
  const createAndCreateAnother = async (data: z.infer<typeof permissionSchema>) => {
    try {
      const { error } = await supabase.from('permissions').insert([
        {
          permission: data.permission
        }
      ])

      if (error) {
        if (error.code === '23505') {
          toast('error', 'This permission already exists')

          return
        }

        throw error
      }

      toast('success', 'Permission created successfully')
      form.reset()
    } catch (error: any) {
      toast('error', 'Error creating permission: ' + error.message)
    }
  }

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Create Permissions</h2>
      <Form {...form}>
        <form>
          <Card>
            <CardContent className='pbs-6'>
              <FormField
                control={form.control}
                name='permission'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='mbe-2 block text-sm font-medium'>
                      Name<span className='text-destructive'>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type='text' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          <div className='mbs-6 flex justify-start gap-4'>
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Creating...'>
              Create
            </SubmitButton>
            <SubmitButton formAction={form.handleSubmit(createAndCreateAnother) as any} pendingText='Creating...'>
              Create and Create Another
            </SubmitButton>
            <Button variant='tonalDefault' asChild>
              <Link href='/admin/permissions'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Create
