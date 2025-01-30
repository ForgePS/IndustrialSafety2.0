'use client'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit, TbEye } from 'react-icons/tb'
import type { ColumnDef } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import DataTable from '@repo/ui/components/ui/data-table'
import type { Database } from '@repo/supabase/types'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

export const handleDelete = async (id: number, t: TFunction) => {
  const supabase = createClient()

  try {
    // Check if role has any assigned users in user_roles table
    const { data: userRoles } = await supabase.from('user_roles').select('user_id').eq('role_id', id)

    if (userRoles && userRoles.length > 0) {
      toast('error', t('admin:rolesActionsDeleteUsersError')),
        {
          duration: 6000
        }

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

const Roles = ({ rolesData }: { rolesData: Database['public']['Tables']['roles']['Row'][] }) => {
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
      cell: ({ row }) => <div className='capitalize'>{row.getValue('hierarchy')}</div>
    },
    {
      accessorKey: 'Actions',
      id: 'actions',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <Link href={`/admin/roles/${row.original.id}/edit`} className='text-primary me-3.5 flex items-center gap-1'>
            <TbEdit />
            <Trans i18nKey='admin:editButton' />
          </Link>
          <Link href={`/admin/roles/${row.original.id}/view`} className='text-primary flex items-center gap-1'>
            <TbEye />
            <Trans i18nKey='admin:viewButton' />
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            itemName='role'
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
    <div className='grid grid-cols-1 gap-y-8'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>
          <Trans i18nKey='admin:rolesLabel' />
        </h1>
        <Link href='/admin/roles/create'>
          <Button className='max-sm:is-full'>
            <Trans i18nKey='admin:rolesNewRole' />
          </Button>
        </Link>
      </div>
      <Card>
        <DataTable data={rolesData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Roles
