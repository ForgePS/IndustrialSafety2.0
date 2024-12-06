'use client'

// Next Imports
import Image from 'next/image'
import Link from 'next/link'

// Third-party Imports
import { TbLogout, TbMoodSmile, TbSettings } from 'react-icons/tb'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@repo/ui/components/ui/dropdown-menu'
import { Button } from '@repo/ui/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/ui/avatar'
import { useSignOut } from '@repo/supabase/hooks'
import { getInitials } from '@repo/ui/utils/getInitials'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@repo/supabase/types'

type Props = {
  user: User
  userTableData: Database['public']['Tables']['users']['Row']
  roles?: string[]
}

const UserDropdown = ({ user, userTableData, roles }: Props) => {
  // Hooks
  const signOutMutation = useSignOut()

  // Vars
  const userName = userTableData.name || user.user_metadata.name || user.email
  const avatarFallbackText = getInitials(userName).toUpperCase()
  const avatarSrc = user?.user_metadata.user_avatar || user?.user_metadata.avatar_url

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='!outline-0'>
          <Avatar size='lg'>
            <AvatarImage asChild src={avatarSrc}>
              <Image alt={userName} src={avatarSrc} priority quality={100} height={36} width={36} />
            </AvatarImage>
            <AvatarFallback>{avatarFallbackText}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-is-[200px]'>
        <DropdownMenuItem asChild>
          <Link href='/admin/my-profile'>
            <Avatar size='lg'>
              <AvatarImage asChild src={avatarSrc}>
                <Image alt={userName} src={avatarSrc} priority quality={100} height={36} width={36} />
              </AvatarImage>
              <AvatarFallback>{avatarFallbackText}</AvatarFallback>
            </Avatar>
            {userTableData.name || user.user_metadata.name ? (
              <div className='flex flex-col items-start overflow-hidden'>
                <h6 className='is-full truncate font-semibold'>{userTableData.name || user.user_metadata.name}</h6>
                <small className='is-full truncate'>{user.email}</small>
              </div>
            ) : (
              <small className='truncate'>{user.email}</small>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {!roles?.includes('admin') ? (
          <DropdownMenuItem asChild>
            <Link href='/dashboard' className='flex gap-2'>
              <TbMoodSmile className='text-xl' />
              <span>User Dashboard</span>
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className='flex gap-2' asChild>
            <Link href='/admin' className='flex gap-2'>
              <TbSettings className='text-xl' />
              <span>Admin Panel</span>
            </Link>
          </DropdownMenuItem>
        )}
        <form action={() => signOutMutation.mutateAsync()}>
          <DropdownMenuItem asChild className='is-full flex cursor-pointer gap-2'>
            <button type='submit'>
              <TbLogout className='text-xl' />
              <span>Sign out</span>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserDropdown
