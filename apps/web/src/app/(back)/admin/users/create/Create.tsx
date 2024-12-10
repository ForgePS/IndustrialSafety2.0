'use client'

// React Imports
import { useEffect, useState } from 'react'

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
import { MultiSelect } from '@repo/ui/components/ui/multi-select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import SubmitButton from '@repo/ui/components/SubmitButton'
import type { Database } from '@repo/supabase/types'
import { toast } from '@repo/ui/utils/toast'

// Util Imports
import { createUser } from '../actions'

// Define Zod Schema for validation
const userSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  email: z.string().min(1, { message: 'Email address is required.' }).email({
    message: 'Please enter a valid email address.'
  }),
  password: z.string().min(1, { message: 'Password is required.' }).min(8, {
    message: 'Password must be at least 8 characters.'
  }),
  roles: z.array(z.string()).nonempty({ message: 'Please select at least one role' })
})

const Create = ({ roles }: { roles: Database['public']['Tables']['roles']['Row'][] }) => {
  // States
  const [selected, setSelected] = useState<string[]>(['user'])

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      roles: selected
    }
  })

  const { setValue, clearErrors } = form

  // Form Submit handler
  const onSubmit = async (data: z.infer<typeof userSchema>) => {
    try {
      const result = await createUser({
        name: data.name,
        email: data.email,
        password: data.password,
        roles: roles,
        selectedRoles: selected
      })

      if ('error' in result) {
        toast('error', result.error || 'An unexpected error occurred. Please try again.')
      } else {
        toast('success', result.message || 'User created successfully')
        router.push('/admin/users')
        router.refresh()
      }
    } catch (error) {
      console.error('Error creating user:', error)

      return false
    }
  }

  const createAndCreateSubmit = async (data: z.infer<typeof userSchema>) => {
    try {
      const result = await createUser({
        name: data.name,
        email: data.email,
        password: data.password,
        roles: roles,
        selectedRoles: selected
      })

      if ('error' in result) {
        toast('error', result.error || 'An unexpected error occurred. Please try again.')
      } else {
        toast('success', result.message || 'User created successfully')
        form.reset()
        router.refresh()
      }
    } catch (error) {
      console.error('Error creating user:', error)

      return false
    }
  }

  // Update form value and clear errors when selected changes
  useEffect(() => {
    setValue('roles', selected) // Sync the form's roles field with selected

    if (selected.length > 0) {
      clearErrors('roles') // Clear the error for roles when a role is selected
    }
  }, [selected, setValue, clearErrors])

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>Create User</h2>
      <Form {...form}>
        <form>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='name' className='mbe-2 block text-sm font-medium'>
                        Name<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input id='name' type='text' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='email' className='mbe-2 block text-sm font-medium'>
                        Email<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input id='email' type='email' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='password'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='password' className='mbe-2 block text-sm font-medium'>
                        Password<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input id='password' type='password' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='roles'
                  render={() => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='roles' className='mbe-2 block text-sm font-medium'>
                        Roles<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <MultiSelect
                          className='!bs-[unset]'
                          selected={selected}
                          setSelected={setSelected}
                          options={roles.map(role => ({
                            value: role.role,
                            label: role.role
                          }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          <div className='mbs-6 flex justify-start gap-4'>
            <SubmitButton formAction={form.handleSubmit(onSubmit as any) as any} pendingText='Creating...'>
              Create
            </SubmitButton>
            <SubmitButton formAction={form.handleSubmit(createAndCreateSubmit as any) as any} variant='tonalDefault'>
              Create & create another
            </SubmitButton>
            <Button type='button' variant='tonalDefault'>
              <Link href='/admin/users'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Create
