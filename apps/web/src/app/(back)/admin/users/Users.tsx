'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import type { ColumnDef } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import DataTable from '@repo/ui/components/ui/data-table'
import { Button } from '@repo/ui/components/ui/button'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import type { Database } from '@repo/supabase/types'
import { toast } from '@repo/ui/utils/toast'

// Util Imports
import { deleteUser } from './actions'

type UserWithRole = Database['public']['Tables']['users']['Row'] & {
  role: string
  hasAdminRole: boolean
}

const Users = ({
  usersRecord,
  rolesData
}: {
  usersRecord: Database['public']['Tables']['users']['Row'][]
  rolesData: { user_id: number; role_id: number; roles: { role: string } }[]
}) => {
  // Merge roles with users
  const mergedData = usersRecord.map(user => {
    // Filter all roles assigned to the user
    const userRoles = rolesData.filter(role => role.user_id === user.id).map(role => role.roles.role) // Extract role names

    return {
      ...user,
      role: userRoles.join(', '), // Add all roles as a comma-separated string
      hasAdminRole: userRoles.includes('admin')
    }
  })

  // States
  const [users, setUsers] = useState<UserWithRole[]>(mergedData)

  // Hooks
  const router = useRouter()

  const handleDeleteUser = async ({ id }: { id: number }) => {
    try {
      const result = await deleteUser(id)

      if ('error' in result) {
        toast('error', 'An unexpected error occurred. Please try again.')
      } else {
        toast('success', 'User deleted successfully')
        setUsers(users.filter(user => user.id !== id))
        router.push('/admin/users')
      }
    } catch (error) {
      console.error('Error deleting user:', error)

      return false
    }
  }

  const columns: ColumnDef<UserWithRole>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <div className='capitalize'>{row.original.name}</div>
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <div>{row.original.email}</div>
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => <div>{row.original.role}</div>
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center gap-4'>
          <Link href={`/admin/users/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            Edit
          </Link>
          {!row.original.hasAdminRole && (
            <DeleteDialog variant='ghostDestructive' handleDelete={() => handleDeleteUser({ id: row.original.id })} />
          )}
        </div>
      )
    }
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h2 className='text-textPrimary text-2xl font-bold'>Users</h2>
        <Link href='/admin/users/create'>
          <Button className='max-sm:is-full'>New user</Button>
        </Link>
      </div>
      <Card>
        <DataTable data={users} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Users
