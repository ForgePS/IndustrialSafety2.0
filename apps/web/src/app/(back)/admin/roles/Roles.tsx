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

export const handleDelete = async (id: number) => {
  const supabase = createClient()

  try {
    // Check if role has any assigned users in user_roles table
    const { data: userRoles } = await supabase.from('user_roles').select('user_id').eq('role_id', id)

    if (userRoles && userRoles.length > 0) {
      toast('error', 'Cannot delete role with assigned users'),
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
      toast('error', 'This role has assigned permissions. Please remove all permissions before deleting the role.'),
        {
          duration: 7000
        }

      return
    }

    // If no assigned users or permissions, proceed with deletion
    const { error } = await supabase.from('roles').delete().eq('id', id)

    if (error) {
      toast('error', 'Error deleting role: ' + error.message)

      return
    }

    toast('success', 'Role deleted successfully')
  } catch (error: any) {
    toast('error', 'Error deleting role: ' + error.message)
  }
}

const Roles = ({ rolesData }: { rolesData: Database['public']['Tables']['roles']['Row'][] }) => {
  // Hooks
  const router = useRouter()

  // Define Columns
  const columns: ColumnDef<Database['public']['Tables']['roles']['Row']>[] = [
    {
      accessorKey: 'role',
      header: 'Name',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('role')}</div>
    },
    {
      accessorKey: 'hierarchy',
      header: 'Hierarchy',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('hierarchy')}</div>
    },
    {
      accessorKey: 'Actions',
      id: 'actions',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <Link href={`/admin/roles/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            Edit
          </Link>
          <Link href={`/admin/roles/${row.original.id}/view`} className='text-primary flex items-center gap-1'>
            <TbEye />
            View
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            itemName='role'
            handleDelete={() => {
              handleDelete(row.original.id)
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
        <h1 className='text-textPrimary text-3xl font-bold'>Roles</h1>
        <Link href='/admin/roles/create'>
          <Button className='max-sm:is-full'>New Role</Button>
        </Link>
      </header>
      <section className='space-b-6 divide-b divide-border'>
        <Card>
          <DataTable data={rolesData} columns={columns} search={{ enabled: true }} />
        </Card>
      </section>
    </div>
  )
}

export default Roles
