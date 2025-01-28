'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import type { ColumnDef, Row } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import DataTable from '@repo/ui/components/ui/data-table'
import { Button } from '@repo/ui/components/ui/button'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { useAuthContext } from '@repo/auth/AuthProvider'
import { toast } from '@repo/ui/utils/toast'
import { PermissionGuard } from '@repo/rbac/components'
import { hasAnyPermission, hasPermission } from '@repo/rbac/utils'
import type { Database } from '@repo/supabase/types'
import Trans from '@repo/i18n/Trans'

// Util Imports
import { deleteUser } from './actions'

type Props = {
  usersRecord: Database['public']['Tables']['users']['Row'][]
  rolesData: { user_id: number; role_id: number; roles: { role: string } }[]
  userPermissions: string[]
}

type UserWithRole = Database['public']['Tables']['users']['Row'] & {
  role: string[]
}

const Users = ({ usersRecord, rolesData, userPermissions }: Props) => {
  // Merge roles with users
  const mergedData = usersRecord.map(user => {
    // Get roles for each user
    const userRoles = rolesData.filter(role => role.user_id === user.id).map(role => role.roles.role)

    return {
      ...user,
      role: userRoles
    }
  })

  // States
  const [users, setUsers] = useState<UserWithRole[]>(mergedData)
  const { startImpersonation } = useAuthContext()

  // Hooks
  const router = useRouter()

  const handleDeleteUser = async ({ id }: { id: number }) => {
    try {
      const result = await deleteUser(id)

      if ('error' in result) {
        toast('error', result.error as string)
      } else {
        toast('success', result.message as string)
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
      header: () => <Trans i18nKey='admin:nameLabel' />,
      cell: ({ row }) => <div className='capitalize'>{row.original.name}</div>
    },
    {
      accessorKey: 'email',
      header: () => <Trans i18nKey='admin:emailLabel' />,
      cell: ({ row }) => <div>{row.original.email}</div>
    },
    {
      accessorKey: 'role',
      header: () => <Trans i18nKey='admin:roleLabel' />,
      cell: ({ row }) => (
        <div>{row.original.role.map(userRole => userRole.charAt(0).toUpperCase() + userRole.slice(1)).join(', ')}</div>
      )
    },
    ...(hasAnyPermission(userPermissions, ['update_users', 'impersonate_users', 'delete_users'])
      ? [
          {
            id: 'actions',
            enableHiding: false,
            cell: ({ row }: { row: Row<UserWithRole> }) => (
              <div className='flex items-center gap-4'>
                {hasPermission(userPermissions, 'update_users') && (
                  <Link href={`/admin/users/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
                    <TbEdit />
                    <Trans i18nKey='admin:editButton' />
                  </Link>
                )}
                {hasPermission(userPermissions, 'impersonate_users') && !row.original.role.includes('admin') && (
                  <Button variant='outline' onClick={() => startImpersonation(usersRecord, row.original.user_id)}>
                    <Trans i18nKey='admin:usersImpersonateButton' />
                  </Button>
                )}
                {hasPermission(userPermissions, 'delete_users') && !row.original.role.includes('admin') && (
                  <DeleteDialog
                    variant='ghostDestructive'
                    handleDelete={() => handleDeleteUser({ id: row.original.id })}
                    itemName='user'
                  />
                )}
              </div>
            )
          }
        ]
      : [])
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h2 className='text-textPrimary text-2xl font-bold'>
          <Trans i18nKey='admin:usersSection' />
        </h2>
        <PermissionGuard permissions={userPermissions} permission={'create_users'}>
          <Link href='/admin/users/create'>
            <Button className='max-sm:is-full'>
              <Trans i18nKey='admin:usersNewButton' />
            </Button>
          </Link>
        </PermissionGuard>
      </div>
      <Card>
        <DataTable data={users} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Users
