'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbSearch, TbShieldLock } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type AccessUserListItem = {
  userId: string
  name: string | null
  email: string
  membershipRole: string
  isActive: boolean
  assignedRoles: string[]
  overrideCount: number
}

const AccessUsers = ({
  organizationId,
  users
}: {
  organizationId: string
  users: AccessUserListItem[]
}) => {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users

    return users.filter(user =>
      [user.name, user.email, user.membershipRole, ...user.assignedRoles]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    )
  }, [search, users])

  return (
    <div className='flex flex-col gap-5'>
      <Card>
        <CardContent className='p-5'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search personnel by name, email or role...'
              className='pl-10'
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Personnel</TableHead>
              <TableHead>Membership</TableHead>
              <TableHead>Assigned Roles</TableHead>
              <TableHead>Overrides</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(user => (
              <TableRow key={user.userId}>
                <TableCell>
                  <div className='text-textPrimary font-semibold'>{user.name || 'Unnamed User'}</div>
                  <div className='text-textSecondary text-xs'>{user.email}</div>
                </TableCell>
                <TableCell className='capitalize'>{user.membershipRole}</TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1.5'>
                    {user.assignedRoles.length
                      ? user.assignedRoles.map(role => <Badge key={role} size='sm' variant='outline'>{role}</Badge>)
                      : <span className='text-textSecondary text-sm'>No Forge role assigned</span>}
                  </div>
                </TableCell>
                <TableCell>{user.overrideCount}</TableCell>
                <TableCell>
                  <Badge size='sm' variant={user.isActive ? 'tonalSuccess' : 'secondary'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className='flex justify-end'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={`/admin/creator/tenants/${organizationId}/access/users/${user.userId}`}>
                        <TbShieldLock />
                        Manage Access
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={6} className='py-10 text-center'>No personnel match the search.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default AccessUsers
