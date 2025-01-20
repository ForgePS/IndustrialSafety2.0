'use client'

// Third-party Imports
import { Card } from '@repo/ui/components/ui/card'
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import DataTable from '@repo/ui/components/ui/data-table'
import type { Database } from '@repo/supabase/types'

// Types Imports
import type { ColumnDef } from '@tanstack/react-table'

type Props = {
  usersRecord: Database['public']['Tables']['users']['Row'][]
  rolesData: { user_id: number; role_id: number; roles: { role: string } }[]
}

type UserWithRole = Database['public']['Tables']['users']['Row'] & {
  role: string[]
}

const UsersTable = ({ usersRecord, rolesData }: Props) => {
  // Merge roles with users
  const mergedData = usersRecord.map(user => {
    // Get roles for each user
    const userRoles = rolesData.filter(role => role.user_id === user.id).map(role => role.roles.role)

    return {
      ...user,
      role: userRoles
    }
  })

  const columns: ColumnDef<UserWithRole>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          size='sm'
          checked={table.getIsAllPageRowsSelected() || table.getIsSomePageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          size='sm'
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label='Select row'
        />
      ),
      enableSorting: false
    },
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <div>{row.original.id}</div>
    },
    {
      accessorKey: 'name',
      header: 'User Name',
      cell: ({ row }) => <div className='capitalize'>{row.original.name}</div>
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <div className='lowercase'>{row.original.email}</div>
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <div>{row.original.role.map(userRole => userRole.charAt(0).toUpperCase() + userRole.slice(1)).join(', ')}</div>
      )
    }
  ]

  return (
    <Card className='col-span-full max-lg:order-2 lg:col-span-2'>
      <DataTable
        data={mergedData}
        columns={columns}
        title={<p className='font-semibold'>Users</p>}
        search={{ enabled: false }}
      />
    </Card>
  )
}

export default UsersTable
