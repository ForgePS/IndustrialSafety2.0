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

const Permissions = ({ permissionsData }: { permissionsData: PermissionType[] }) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // Define Columns
  const columns: ColumnDef<PermissionType>[] = [
    {
      accessorKey: 'permission',
      header: () => <Trans i18nKey='admin:permissionsNameColumn' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('permission')}</div>
    },
    {
      accessorKey: 'Actions',
      id: 'actions',
      header: () => <Trans i18nKey='admin:actionsColumn' />,
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <Link href={`/admin/permissions/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            <Trans i18nKey='admin:editButton' />
          </Link>
          <Link href={`/admin/permissions/${row.original.id}/view`} className='text-primary flex items-center gap-1'>
            <TbEye />
            <Trans i18nKey='admin:viewButton' />
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            itemName='permission'
            handleDelete={() => {
              handleDelete(row.original.id, t)
              router.refresh()
            }}
          />
        </div>
      )
    }
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <header className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-3xl font-bold'>
          <Trans i18nKey='admin:permissionsLabel' />
        </h1>
        <Link href='/admin/permissions/create'>
          <Button className='max-sm:is-full'>
            <Trans i18nKey='admin:permissionsNewButton' />
          </Button>
        </Link>
      </header>
      <section className='space-b-6 divide-b divide-border'>
        <Card>
          <DataTable data={permissionsData} columns={columns} search={{ enabled: true }} />
        </Card>
      </section>
    </div>
  )
}

export default Permissions
