'use client'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit, TbEye } from 'react-icons/tb'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import DataTable from '@repo/ui/components/ui/data-table'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@repo/rbac/utils'
import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import type { Database } from '@repo/supabase/types'

export const handleDelete = async (id: number, t: TFunction) => {
  const supabase = createClient()

  try {
    // First get the role's hierarchy
    const { data: roleToDelete } = await supabase.from('roles').select('hierarchy').eq('id', id).single()

    if (!roleToDelete) {
      toast('error', t('admin:rolesActionsNotFoundError'))

      return
    }

    // Check if role has any assigned users in user_roles table
    const { data: userRoles } = await supabase.from('user_roles').select('user_id').eq('role_id', id)

    if (userRoles && userRoles.length > 0) {
      toast('error', t('admin:rolesActionsDeleteUsersError'))

      return
    }

    // Check if the role has any assigned permissions in role_permissions table
    const { data: rolePermissions, error: rolePermissionsError } = await supabase
      .from('role_permissions')
      .select('id')
      .eq('role_id', id)

    if (rolePermissionsError) throw rolePermissionsError

    if (rolePermissions && rolePermissions.length > 0) {
      toast('error', t('admin:rolesActionsDeletePermissionsError')),
        {
          duration: 7000
        }

      return
    }

    // If no assigned users or permissions, proceed with deletion
    const { error } = await supabase.from('roles').delete().eq('id', id)

    if (error) {
      toast('error', t('admin:rolesActionsDeleteError', { message: error.message }))

      return
    }

    toast('success', t('admin:rolesActionsDeleteSuccess'))
  } catch (error: any) {
    toast('error', t('admin:rolesActionsDeleteError', { message: error.message }))
  }
}

const Roles = ({
  rolesData,
  userPermissions
}: {
  rolesData: Database['public']['Tables']['roles']['Row'][]
  userPermissions: string[]
}) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // Define Columns
  const columns: ColumnDef<Database['public']['Tables']['roles']['Row']>[] = [
    {
      accessorKey: 'role',
      header: () => <Trans i18nKey='admin:nameLabel' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('role')}</div>
    },
    {
      accessorKey: 'hierarchy',
      header: () => <Trans i18nKey='admin:hierarchyLabel' />,
      cell: ({ row }) => row.getValue('hierarchy')
    },
    {
      accessorKey: 'Actions',
      id: 'actions',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          {hasPermission(userPermissions, 'update_roles') && (
            <Link href={`/admin/roles/${row.original.id}/edit`} className='text-primary me-3.5 flex items-center gap-1'>
              <TbEdit />
              <Trans i18nKey='admin:editButton' />
            </Link>
          )}
          <Link href={`/admin/roles/${row.original.id}/view`} className='text-primary flex items-center gap-1'>
            <TbEye />
            <Trans i18nKey='admin:viewButton' />
          </Link>
          {hasPermission(userPermissions, 'delete_roles') && (
            <DeleteDialog
              variant='ghostDestructive'
              itemName='role'
              handleDelete={() => {
                handleDelete(row.original.id, t)
                router.refresh()
              }}
            />
          )}
        </div>
      )
    }
  ]

  return (
    <div className='grid grid-cols-1 gap-y-8'>
      <div className='flex flex-wrap gap-4 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='admin:rolesLabel' />
        </h1>
        {hasPermission(userPermissions, 'create_roles') && (
          <Button className='max-sm:is-full' asChild>
            <Link href='/admin/roles/create'>
              <Trans i18nKey='admin:rolesNewRole' />
            </Link>
          </Button>
        )}
      </div>
      <section className='space-b-6 divide-b divide-border'>
        <Card>
          <DataTable data={rolesData} columns={columns} search={{ enabled: true }} />
        </Card>
      </section>
    </div>
  )
}

export default Roles
