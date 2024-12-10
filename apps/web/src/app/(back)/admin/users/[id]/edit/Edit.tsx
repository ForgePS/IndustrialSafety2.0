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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { MultiSelect } from '@repo/ui/components/ui/multi-select'
import SubmitButton from '@repo/ui/components/SubmitButton'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import type { Database } from '@repo/supabase/types'
import { toast } from '@repo/ui/utils/toast'

// Util Imports
import { editUser, deleteUser } from '../../actions'

// Define Zod Schema for validation
const userSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  email: z.string().min(1, { message: 'Email address is required.' }).email({
    message: 'Please enter a valid email address.'
  }),
  password: z.string().optional(),
  roles: z.array(z.string()).nonempty({ message: 'Please select at least one role' })
})

const Edit = ({
  userData,
  userRolesData,
  id,
  roles
}: {
  userData: Database['public']['Tables']['users']['Row']
  userRolesData: { role_id: number; roles: { role: string } }[]
  id: number
  roles: Database['public']['Tables']['roles']['Row'][]
}) => {
  // States
  const [selected, setSelected] = useState<string[]>([userRolesData.map(role => role.roles.role)[0]])
  const [isAdmin, setIsAdmin] = useState(false)

  // Hooks
  const router = useRouter()

  // react-hook-form integration with Zod schema validation
  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: userData.name ?? '',
      email: userData.email ?? '',
      password: '',
      roles: selected
    }
  })

  const { setValue, clearErrors } = form

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof userSchema>) => {
    try {
      const result = await editUser({
        id,
        name: data.name,
        email: data.email,
        password: data.password,
        roles,
        selectedRoles: selected
      })

      if ('error' in result) {
        toast('error', result.error || 'An unexpected error occurred. Please try again.')
      } else {
        toast('success', result.message || 'User updated successfully')
        router.push('/admin/users')
        router.refresh()
      }
    } catch (error) {
      console.error('Error updating user:', error)

      return false
    }
  }

  // Handle Delete User
  const handleDelete = async () => {
    try {
      const result = await deleteUser(id)

      if ('error' in result) {
        toast('error', 'An unexpected error occurred. Please try again.')
      } else {
        toast('success', result.message || 'User deleted successfully')
        router.push('/admin/users')
        router.refresh()
      }
    } catch (error) {
      console.error('Error deleting user:', error)

      return false
    }
  }

  // Render selected roles after updating user roles
  useEffect(() => {
    const assignedRoles = userRolesData.map(role => role.roles.role)

    setSelected(assignedRoles)
  }, [userRolesData])

  // Set selected roles from userRolesData and check if user is an admin in the database
  useEffect(() => {
    const assignedRoles = userRolesData.map(role => role.roles.role)

    setSelected(assignedRoles)
    setIsAdmin(assignedRoles.includes('admin')) // Set isAdminFromDatabase based on DB roles
  }, [userRolesData])

  // Update form value and clear errors when selected changes
  useEffect(() => {
    setValue('roles', selected as [string]) // Sync the form's roles field with selected

    if (selected.length > 0) {
      clearErrors('roles') // Clear the error for roles when a role is selected
    }
  }, [selected, setValue, clearErrors])

  return (
    <>
      <div className='mbe-6 flex items-center justify-between gap-4'>
        <h2 className='text-2xl font-semibold sm:text-3xl'>Edit User</h2>
        {!isAdmin && <DeleteDialog handleDelete={handleDelete} />}
      </div>
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
                      <FormLabel>
                        Name<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input type='text' placeholder='Name' {...field} />
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
                      <FormLabel>
                        Email<span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input type='email' {...field} placeholder='Email' />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type='password' placeholder='················' {...field} />
                      </FormControl>
                      <span className='text-textDisabled text-sm'>Leave blank to keep the same password</span>
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Saving...'>
              Save changes
            </SubmitButton>
            <Button type='button' variant='tonalDefault' asChild>
              <Link href='/admin/users'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Edit
