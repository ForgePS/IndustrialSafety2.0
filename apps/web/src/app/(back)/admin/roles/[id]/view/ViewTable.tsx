'use client'

// Third-party Imports
import type { ColumnDef } from '@tanstack/react-table'
import type { Database } from '@repo/supabase/types'

// Component Imports
import { Card } from '@repo/ui/components/ui/card'
import DataTable from '@repo/ui/components/ui/data-table'

type User = {
  name: string
  email: string
}

type RolesUsers = Database['public']['Tables']['roles']['Row'] & {
  users: User[]
}

const ViewTable = ({ users }: { users: RolesUsers[] }) => {
  // Get all users from the role
  const allUsers = users[0]?.users || []

  // Define Columns
  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <div className='capitalize'>{row.original.name}</div>
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <div className='capitalize'>{row.original.email}</div>
    }
  ]

  return (
    <div className='flex flex-col gap-y-4'>
      <Card>
        <DataTable
          data={allUsers}
          columns={columns}
          search={{ enabled: true }}
          title={<h2 className='text-lg font-medium'>Users</h2>}
        />
      </Card>
    </div>
  )
}

export default ViewTable
