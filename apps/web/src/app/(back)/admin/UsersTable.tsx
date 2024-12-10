'use client'

// Third-party Imports
import { Card } from '@repo/ui/components/ui/card'
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import DataTable from '@repo/ui/components/ui/data-table'

// Types Imports
import type { ColumnDef } from '@tanstack/react-table'

type User = {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
  status: 'active' | 'inactive'
}

// Vars
const users: User[] = [
  {
    id: 1,
    name: 'John Doe',
    email: 'johndoe@email.com',
    role: 'admin',
    status: 'active'
  },
  {
    id: 2,
    name: 'Jane Doe',
    email: 'janedoe@email.com',
    role: 'user',
    status: 'active'
  },
  {
    id: 3,
    name: 'John Smith',
    email: 'johnsmith@email.com',
    role: 'user',
    status: 'inactive'
  }
]

const columns: ColumnDef<User>[] = [
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
    cell: ({ row }) => <div>{row.getValue('id')}</div>
  },
  {
    accessorKey: 'name',
    header: 'User Name',
    cell: ({ row }) => <div className='capitalize'>{row.getValue('name')}</div>
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => <div className='lowercase'>{row.getValue('email')}</div>
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => <div>{row.getValue('role')}</div>
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <div>{row.getValue('status')}</div>
  }
]

const UsersTable = () => {
  return (
    <Card className='col-span-full max-lg:order-2 lg:col-span-2'>
      <DataTable
        data={users}
        columns={columns}
        title={<p className='font-semibold'>Users</p>}
        search={{ enabled: false }}
      />
    </Card>
  )
}

export default UsersTable
