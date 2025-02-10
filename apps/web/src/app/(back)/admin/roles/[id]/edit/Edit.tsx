'use client'

// React Imports
import { useState, useTransition } from 'react'

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
import { createClient } from '@repo/supabase/client'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@repo/rbac/utils'
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

type EditProps = {
  roleData: Role
  id: number
  permissionsData: Permission[]
  rolePermissionsData: RolePermission[]
  userPermissions: string[]
}

const Edit = ({ roleData, id, permissionsData, rolePermissionsData, userPermissions }: EditProps) => {
  // States
  const [selected, setSelected] = useState<string[]>(rolePermissionsData.map(rp => rp.permissions))
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

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

  const onSubmit = (data: z.infer<typeof roleSchema>) => {
    startTransition(async () => {
      try {
        const { isRoleExists, isHierarchyExists } = await checkDuplicates(data.role, data.hierarchy)

        if (isRoleExists) {
          toast('error', t('admin:rolesActionsDuplicateNameError'))

          return
        }

        if (isHierarchyExists) {
          toast('error', t('admin:rolesActionsDuplicateHierarchyError'))

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
          toast('error', t('admin:rolesActionsUpdateRoleError', { message: roleError.message }))

          return
        }

        // Get existing permissions
        const { data: existingPermissions, error: permissionsFetchError } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', roleData.id)

        if (permissionsFetchError) {
          toast('error', t('admin:rolesActionsFetchPermissionsError', { message: permissionsFetchError.message }))

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
            toast('error', t('admin:rolesActionsAddPermissionsError', { message: addError.message }))

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
            toast('error', t('admin:rolesActionsRemovePermissionsError', { message: removeError.message }))

            return
          }
        }

        toast('success', t('admin:rolesActionsUpdateSuccess'))
        router.push('/admin/roles')
        router.refresh()
      } catch (error: any) {
        toast('error', t('admin:rolesActionsUpdateError', { message: error.message }))
      }
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex flex-wrap gap-4 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='admin:rolesEditTitle' />
        </h1>
        <div className='flex gap-4 max-sm:flex-col sm:items-center'>
          <Button variant='tonalDefault'>
            <Link href={`/admin/roles/${id}/view`}>
              <Trans i18nKey='admin:viewButton' />
            </Link>
          </Button>
          {hasPermission(userPermissions, 'delete_roles') && (
            <DeleteDialog
              itemName='role'
              handleDelete={() => {
                handleDelete(id, t)
                router.push('/admin/roles')
                router.refresh()
              }}
            />
          )}
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans i18nKey='admin:rolesNameLabel' />
                      </FormLabel>
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
                      <FormLabel>
                        <Trans i18nKey='admin:hierarchyLabel' />
                      </FormLabel>
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
                      <FormLabel>
                        <Trans i18nKey='admin:permissionsLabel' />
                      </FormLabel>
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
          <div className='mbs-6 flex gap-4 max-sm:flex-col'>
            <Button type='submit' disabled={pending}>
              {pending ? <Trans i18nKey='admin:rolesFormUpdating' /> : <Trans i18nKey='admin:saveButton' />}
            </Button>
            <Button variant='tonalDefault' asChild>
              <Link href='/admin/roles'>
                <Trans i18nKey='admin:cancelButton' />
              </Link>
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default Edit
