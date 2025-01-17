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
const roleSchema = z.object({
  role: z.string().min(1, { message: 'Role name is required.' }),
  hierarchy: z.coerce.number().min(1, { message: 'Hierarchy is required.' })
})

const Create = () => {
  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // Form setup
  const form = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      role: '',
      hierarchy: 4
    }
  })

  // Separate checks for role and hierarchy
  const checkDuplicates = async (role: string, hierarchy: number) => {
    const { data } = await supabase
      .from('roles')
      .select('role, hierarchy')
      .or(`role.eq.${role},hierarchy.eq.${hierarchy}`)

    const isRoleExists = data?.some(r => r.role === role)
    const isHierarchyExists = data?.some(r => r.hierarchy === hierarchy)

    return { isRoleExists, isHierarchyExists }
  }

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof roleSchema>) => {
    try {
      const { isRoleExists, isHierarchyExists } = await checkDuplicates(data.role, data.hierarchy)

      if (isRoleExists) {
        toast('error', 'This role name already exists')

        return
      }

      if (isHierarchyExists) {
        toast('error', 'This hierarchy level already exists')

        return
      }

      const { error } = await supabase.from('roles').insert([
        {
          role: data.role,
          hierarchy: data.hierarchy
        }
      ])

      if (error) {
        if (error.code === '23505') {
          // Check which constraint was violated based on the error detail
          if (error.message.includes('roles_role_key')) {
            toast('error', 'This role name already exists')
          } else if (error.message.includes('roles_hierarchy_key')) {
            toast('error', 'This hierarchy level already exists')
          }

          return
        }

        throw error
      }

      toast('success', 'Role created successfully')
      router.push('/admin/roles')
      router.refresh()
    } catch (error: any) {
      toast('error', 'Error creating role: ' + error.message)
    }
  }

  // Create and create another
  const createAndCreateRole = async (data: z.infer<typeof roleSchema>) => {
    try {
      const { isRoleExists, isHierarchyExists } = await checkDuplicates(data.role, data.hierarchy)

      if (isRoleExists) {
        toast('error', 'This role name already exists')

        return
      }

      if (isHierarchyExists) {
        toast('error', 'This hierarchy level already exists')

        return
      }

      const { error } = await supabase.from('roles').insert([
        {
          role: data.role,
          hierarchy: data.hierarchy
        }
      ])

      if (error) {
        if (error.code === '23505') {
          // Check which constraint was violated based on the error detail
          if (error.message.includes('roles_role_key')) {
            toast('error', 'This role name already exists')
          } else if (error.message.includes('roles_hierarchy_key')) {
            toast('error', 'This hierarchy level already exists')
          }

          return
        }

        throw error
      }

      toast('success', 'Role created successfully')
      form.reset()
      router.refresh()
    } catch (error: any) {
      toast('error', 'Error creating role: ' + error.message)
    }
  }

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Create Role</h2>
      <Form {...form}>
        <form>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='mbe-2 block text-sm font-medium'>
                        Name<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='Enter role name' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='hierarchy'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='mbe-2 block text-sm font-medium'>
                        Hierarchy<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input type='number' min='1' placeholder='Enter unique position (e.g., 1, 2, 3)' {...field} />
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
            <SubmitButton
              formAction={form.handleSubmit(createAndCreateRole) as any}
              pendingText='Creating...'
              variant='tonalDefault'
            >
              Create and Create Another
            </SubmitButton>
            <Button variant='tonalDefault' asChild>
              <Link href='/admin/roles'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Create
