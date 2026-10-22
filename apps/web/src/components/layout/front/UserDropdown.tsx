'use client'

// Next Imports
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
import { deleteImpersonationCookies, deletePaymentCookies } from '@repo/auth/action'
import { getInitials } from '@repo/ui/utils/getInitials'
import Trans from '@repo/i18n/Trans'
import type { User } from '@supabase/supabase-js'

type Props = {
  user: User
  roles?: string[]
}

const UserDropdown = ({ user, roles }: Props) => {
  // Hooks
  const signOutMutation = useSignOut()

  // Vars
  const userName =
    user?.user_metadata?.name ||
    user?.email ||
    'Forge User'
  const avatarFallbackText = getInitials(userName).toUpperCase()
  const avatarSrc = user?.user_metadata?.user_avatar || user?.user_metadata?.avatar_url

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='!outline-0'>
          <Avatar size='lg'>
            <AvatarImage asChild src={avatarSrc}>
              <img alt={userName} src={avatarSrc} height={36} width={36} />
            </AvatarImage>
            <AvatarFallback>{avatarFallbackText}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-is-[200px]'>
        <DropdownMenuItem asChild>
          <Link href='/my-profile'>
            <Avatar size='lg'>
              <AvatarImage asChild src={avatarSrc}>
                <img alt={userName} src={avatarSrc} height={36} width={36} />
              </AvatarImage>
              <AvatarFallback>{avatarFallbackText}</AvatarFallback>
            </Avatar>
            {user.user_metadata?.name ? (
              <div className='flex flex-col items-start overflow-hidden'>
                <h6 className='is-full truncate font-semibold'>{user.user_metadata?.name}</h6>
                <small className='is-full truncate'>{user.email}</small>
              </div>
            ) : (
              <small className='truncate'>{user.email}</small>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {roles?.includes('admin') ? (
          <DropdownMenuItem asChild>
            <Link href='/admin' className='flex gap-2'>
              <TbSettings className='shrink-0 text-xl' />
              <span>
                <Trans i18nKey='layout:adminPanel' />
              </span>
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href='/dashboard' className='flex gap-2'>
              <TbMoodSmile className='shrink-0 text-xl' />
              <span>
                <Trans i18nKey='layout:userDashboard' />
              </span>
            </Link>
          </DropdownMenuItem>
        )}
        <form
          action={() =>
            signOutMutation.mutateAsync().then(() => {
              deleteImpersonationCookies()
              deletePaymentCookies()
            })
          }
        >
          <DropdownMenuItem asChild className='is-full flex cursor-pointer gap-2'>
            <button type='submit'>
              <TbLogout className='shrink-0 text-xl' />
              <span>
                <Trans i18nKey='layout:signOut' />
              </span>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserDropdown
