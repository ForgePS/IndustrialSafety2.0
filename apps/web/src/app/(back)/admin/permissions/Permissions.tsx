'use client'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import type { ColumnDef } from '@tanstack/react-table'
import { TbEdit, TbEye } from 'react-icons/tb'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import DataTable from '@repo/ui/components/ui/data-table'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@repo/rbac/utils'
import type { TFunction } from 'i18next'
import type { Database } from '@repo/supabase/types'

type PermissionType = Database['public']['Tables']['permissions']['Row']

export const handleDelete = async (id: number, t: TFunction) => {
  const supabase = createClient()

  try {
    // Check if the permission is assigned to any roles in role_permissions table
    const { data: rolePermissions, error: rolePermissionsError } = await supabase
      .from('role_permissions')
      .select('id')
      .eq('permission_id', id)

    if (rolePermissionsError) {
      toast('error', t('admin:permissionsDeleteRoleCheckError', { message: rolePermissionsError.message }))

      return
    }

    if (rolePermissions && rolePermissions.length > 0) {
      toast('error', t('admin:permissionsDeleteHasRolesError'))

      return
    }

    // If no dependencies, proceed with deletion
    const { error: deleteError } = await supabase.from('permissions').delete().eq('id', id)

    if (deleteError) {
      toast('error', t('admin:permissionsDeleteError', { message: deleteError.message }))

      return
    }

    toast('success', t('admin:permissionsDeleteSuccess'))
  } catch (error: any) {
    toast('error', t('admin:permissionsDeleteError', { message: error.message }))
  }
}

const Permissions = ({
  permissionsData,
  userPermissions
}: {
  permissionsData: PermissionType[]
  userPermissions: string[]
}) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // Define Columns
  const columns: ColumnDef<PermissionType>[] = [
    {
      accessorKey: 'permission',
      header: () => <Trans i18nKey='admin:permissionsNameColumn' />,
      cell: ({ row }) => row.getValue('permission')
    },
    {
      accessorKey: 'Actions',
      id: 'actions',
      header: () => <Trans i18nKey='admin:actionsColumn' />,
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          {hasPermission(userPermissions, 'update_permission') && (
            <Link
              href={`/admin/permissions/${row.original.id}/edit`}
              className='text-primary me-3.5 flex items-center gap-1'
            >
              <TbEdit />
              <Trans i18nKey='admin:editButton' />
            </Link>
          )}
          <Link href={`/admin/permissions/${row.original.id}/view`} className='text-primary flex items-center gap-1'>
            <TbEye />
            <Trans i18nKey='admin:viewButton' />
          </Link>
          {hasPermission(userPermissions, 'delete_permission') && (
            <DeleteDialog
              variant='ghostDestructive'
              itemName='permission'
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
          <Trans i18nKey='admin:permissionsLabel' />
        </h1>
        {hasPermission(userPermissions, 'create_permission') && (
          <Button className='max-sm:is-full' asChild>
            <Link href='/admin/permissions/create'>
              <Trans i18nKey='admin:permissionsNewButton' />
            </Link>
          </Button>
        )}
      </div>
      <Card>
        <DataTable data={permissionsData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Permissions
