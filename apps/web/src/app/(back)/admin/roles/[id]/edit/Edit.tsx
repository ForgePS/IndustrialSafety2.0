'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { MultiSelect } from '@repo/ui/components/ui/multi-select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { toast } from '@repo/ui/utils/toast'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import SubmitButton from '@repo/ui/components/SubmitButton'
import { createClient } from '@repo/supabase/client'
import type { Database } from '@repo/supabase/types'

// Components imports
import { handleDelete } from '../../Roles'

type Permission = Database['public']['Tables']['permissions']['Row']

type Role = Database['public']['Tables']['roles']['Row']

type RolePermission = {
  id: number
  permissions: string
}

const roleSchema = z.object({
  role: z.string().min(1, { message: 'Role is required' }),
  hierarchy: z.coerce.number().min(1, { message: 'Hierarchy is required' }),
  permissions: z.array(z.string())
})

const Edit = ({
  roleData,
  id,
  permissionsData,
  rolePermissionsData
}: {
  roleData: Role
  id: number
  permissionsData: Permission[]
  rolePermissionsData: RolePermission[]
}) => {
  // States
  const [selected, setSelected] = useState<string[]>(rolePermissionsData.map(rp => rp.permissions))

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()

  // Form setup
  const form = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      role: roleData.role,
      hierarchy: roleData.hierarchy,
      permissions: selected
    }
  })

  // Check for duplicates
  const checkDuplicates = async (role: string, hierarchy: number) => {
    const { data } = await supabase
      .from('roles')
      .select('role, hierarchy')
      .or(`role.eq.${role},hierarchy.eq.${hierarchy}`)
      .neq('id', roleData.id) // Exclude current role

    const isRoleExists = data?.some(r => r.role === role)
    const isHierarchyExists = data?.some(r => r.hierarchy === hierarchy)

    return { isRoleExists, isHierarchyExists }
  }

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

      // Update role
      const { error: roleError } = await supabase
        .from('roles')
        .update({
          role: data.role,
          hierarchy: data.hierarchy
        })
        .eq('id', roleData.id)

      if (roleError) {
        toast('error', `Failed to update the role: ${roleError.message}`)

        return
      }

      // Get existing permissions
      const { data: existingPermissions, error: permissionsFetchError } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleData.id)

      if (permissionsFetchError) {
        toast('error', `Failed to fetch existing permissions: ${permissionsFetchError.message}`)

        return
      }

      // Extract existing permissions IDs
      const existingPermissionIds = existingPermissions?.map(p => p.permission_id) || []

      // Map selected permissions to IDs
      const newPermissionIds = selected
        .map(permission => {
          const foundPermission = permissionsData.find(p => p.permission === permission) // Match 'permission' in permissionsData

          return foundPermission?.id
        })
        .filter((id): id is number => id !== undefined)

      // Calculate permissions to add and remove
      const permissionsToAdd = newPermissionIds.filter(id => !existingPermissionIds.includes(id))
      const permissionsToRemove = existingPermissionIds.filter(id => !newPermissionIds.includes(id))

      // Add new permissions
      if (permissionsToAdd.length > 0) {
        const { error: addError } = await supabase
          .from('role_permissions')
          .insert(permissionsToAdd.map(id => ({ role_id: roleData.id, permission_id: id })))

        if (addError) {
          toast('error', `Failed to add new permissions: ${addError.message}`)

          return
        }
      }

      // Remove permissions
      if (permissionsToRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleData.id)
          .in('permission_id', permissionsToRemove)

        if (removeError) {
          toast('error', `Failed to remove old permissions: ${removeError.message}`)

          return
        }
      }

      toast('success', 'Role updated successfully')
      router.push('/admin/roles')
      router.refresh()
    } catch (error: any) {
      toast('error', 'Error updating role: ' + error.message)
    }
  }

  return (
    <>
      <div className='mbe-6 flex items-center justify-between gap-4'>
        <h2 className='text-2xl font-semibold sm:text-3xl'>Edit Role</h2>
        <div className='flex items-center gap-3'>
          <Button variant='tonalDefault'>
            <Link href={`/admin/roles/${id}/view`}>View</Link>
          </Button>
          <DeleteDialog
            itemName='role'
            handleDelete={() => {
              handleDelete(id)
              router.push('/admin/roles')
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
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                      <FormLabel>Hierarchy</FormLabel>
                      <FormControl>
                        <Input type='number' min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='permissions'
                  render={() => (
                    <FormItem>
                      <FormLabel>Permissions</FormLabel>
                      <FormControl>
                        <MultiSelect
                          selected={selected}
                          setSelected={setSelected}
                          options={permissionsData.map((p, i) => ({
                            value: p.permission,
                            label: p.permission,
                            key: i
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
            <SubmitButton formAction={form.handleSubmit(onSubmit) as any} pendingText='Updating...'>
              Save
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

export default Edit
