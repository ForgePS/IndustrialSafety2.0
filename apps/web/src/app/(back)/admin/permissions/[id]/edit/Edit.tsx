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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import SubmitButton from '@repo/ui/components/SubmitButton'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { MultiSelect } from '@repo/ui/components/ui/multi-select'
import type { Database } from '@repo/supabase/types'

// Component Imports
import { handleDelete } from '../../Permissions'

type Permission = Database['public']['Tables']['permissions']['Row']
type Role = Database['public']['Tables']['roles']['Row']
type PermissionRole = {
  id: number
  role: string
}

// Define Zod Schema for validation
const permissionSchema = z.object({
  permission: z.string().min(1, { message: 'Permission name is required.' }),
  roles: z.array(z.string())
})

const Edit = ({
  id,
  permissionData,
  rolesData,
  permissionRolesData
}: {
  id: number
  permissionData: Permission
  rolesData: Role[]
  permissionRolesData: PermissionRole[]
}) => {
  // States
  const [selected, setSelected] = useState<string[]>(permissionRolesData.map(pr => pr.role))

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // Form setup
  const form = useForm<z.infer<typeof permissionSchema>>({
    resolver: zodResolver(permissionSchema),
    defaultValues: {
      permission: permissionData.permission,
      roles: selected
    }
  })

  // Form submission handler
  const onSubmit = async (data: z.infer<typeof permissionSchema>) => {
    try {
      // Update permission
      const { error: permissionError } = await supabase
        .from('permissions')
        .update({
          permission: data.permission
        })
        .eq('id', id)

      if (permissionError) {
        if (permissionError.code === '23505') {
          toast('error', 'This permission already exists')

          return
        }

        toast('error', 'Error updating permission: ' + permissionError.message)

        return
      }

      // Get existing roles
      const { data: existingRoles, error: rolesFetchError } = await supabase
        .from('role_permissions')
        .select('role_id')
        .eq('permission_id', id)

      if (rolesFetchError) {
        toast('error', `Failed to fetch existing roles: ${rolesFetchError.message}`)

        return
      }

      // Extract existing role IDs
      const existingRoleIds = existingRoles?.map(r => r.role_id) || []

      // Map selected roles to IDs
      const newRoleIds = selected
        .map(role => {
          const foundRole = rolesData.find(r => r.role === role)

          return foundRole?.id
        })
        .filter((id): id is number => id !== undefined)

      // Calculate roles to add and remove
      const rolesToAdd = newRoleIds.filter(id => !existingRoleIds.includes(id))
      const rolesToRemove = existingRoleIds.filter(id => !newRoleIds.includes(id))

      // Remove roles
      if (rolesToRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('role_permissions')
          .delete()
          .eq('permission_id', id)
          .in('role_id', rolesToRemove)

        if (removeError) {
          toast('error', 'Error removing roles: ' + removeError.message)

          return
        }
      }

      // Add new roles
      if (rolesToAdd.length > 0) {
        const { error: addError } = await supabase
          .from('role_permissions')
          .insert(rolesToAdd.map(roleId => ({ permission_id: id, role_id: roleId })))

        if (addError) {
          toast('error', 'Error adding roles: ' + addError.message)

          return
        }
      }

      toast('success', 'Permission updated successfully')
      router.push('/admin/permissions')
      router.refresh()
    } catch (error: any) {
      toast('error', 'Error updating permission: ' + error.message)
    }
  }

  return (
    <>
      <div className='mbe-6 flex items-center justify-between gap-4'>
        <h2 className='text-2xl font-semibold sm:text-3xl'>Edit Role</h2>
        <div className='flex items-center gap-3'>
          <Button variant='tonalDefault'>
            <Link href={`/admin/permissions/${id}/view`}>View</Link>
          </Button>
          <DeleteDialog
            itemName='permission'
            handleDelete={() => {
              handleDelete(id)
              router.push('/admin/permissions')
              router.refresh()
            }}
          />
        </div>
      </div>
      <Form {...form}>
        <form>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
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
                <FormField
                  control={form.control}
                  name='roles'
                  render={() => (
                    <FormItem>
                      <FormLabel className='mbe-2 block text-sm font-medium'>Roles</FormLabel>
                      <FormControl>
                        <MultiSelect
                          selected={selected}
                          setSelected={setSelected}
                          options={rolesData.map(role => ({
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Saving...'>Save</SubmitButton>
            <Button variant='tonalDefault' asChild>
              <Link href='/admin/permissions'>Cancel</Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Edit
