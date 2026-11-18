'use client'

// React Imports
import { useEffect } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { useMedia } from 'react-use'
import { useTheme } from 'next-themes'
import { TbUser, TbMoodSmile, TbSun, TbMoonStars, TbDeviceDesktop, TbLogout } from 'react-icons/tb'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator
} from '@repo/ui/components/ui/dropdown-menu'
import { Button } from '@repo/ui/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/ui/avatar'
import { useSignOut } from '@repo/supabase/hooks'
import { deleteImpersonationCookies, deletePaymentCookies } from '@repo/auth/action'
import { useSettings } from '@repo/ui/hooks/useSettings'
import { getInitials } from '@repo/ui/utils/getInitials'
import Trans from '@repo/i18n/Trans'
import type { User } from '@supabase/supabase-js'
import type { Mode } from '@repo/ui/types'

type Props = {
  user: User | null
  roles?: string[]
}

const UserDropdown = ({ user }: Props) => {
  // Hooks
  const { setTheme, systemTheme } = useTheme()
  const { settings, updateSettings } = useSettings()
  const isDark = useMedia('(prefers-color-scheme: dark)', systemTheme === 'dark')
  const signOutMutation = useSignOut()

  // Vars
  const userName =
    user?.user_metadata?.name ||
    user?.email ||
    'Forge User'

  const avatarFallbackText = getInitials(userName).toUpperCase()
  const avatarSrc = user?.user_metadata?.user_avatar || user?.user_metadata?.avatar_url

  const handleClick = (mode: Mode) => {
    if (settings.mode !== mode) {
      updateSettings({ mode })
    }
  }

  useEffect(() => {
    if (settings.mode) {
      if (settings.mode === 'system') {
        setTheme(isDark ? 'dark' : 'light')
      } else {
        setTheme(settings.mode)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='!outline-0'>
          <Avatar size='lg'>
            <AvatarImage alt={userName} src={avatarSrc} />
            <AvatarFallback>{avatarFallbackText}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-is-[200px]'>
        <DropdownMenuItem asChild>
          <Link href='/my-profile' className='flex gap-2'>
            <TbUser className='text-xl' />
            <span className='flex-1 truncate'>
              <Trans i18nKey='layout:myProfile' />
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={settings.mode} className='flex justify-between gap-1'>
          <DropdownMenuRadioItem value='light' onClick={() => handleClick('light')} className='mbs-0 cursor-pointer'>
            <TbSun className='text-xl' />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='dark' onClick={() => handleClick('dark')} className='mbs-0 cursor-pointer'>
            <TbMoonStars className='text-xl' />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='system' onClick={() => handleClick('system')} className='mbs-0 cursor-pointer'>
            <TbDeviceDesktop className='text-xl' />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
            <Link href='/dashboard' className='flex gap-2'>
              <TbMoodSmile className='text-xl' />
              <span className='flex-1 truncate'>
                <Trans i18nKey='layout:userDashboard' />
              </span>
            </Link>
          </DropdownMenuItem>
        <form
          action={() =>
            signOutMutation.mutateAsync().then(() => {
              deleteImpersonationCookies()
              deletePaymentCookies()
            })
          }
        >
          <DropdownMenuItem asChild>
            <button type='submit' className='is-full flex cursor-pointer gap-2 text-start'>
              <TbLogout className='text-xl' />
              <span className='flex-1 truncate'>
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
