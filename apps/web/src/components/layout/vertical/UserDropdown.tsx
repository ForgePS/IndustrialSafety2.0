'use client'

// React Imports
import { useEffect } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { useMedia } from 'react-use'
import { useTheme } from 'next-themes'
import { TbUser, TbMoodSmile, TbSun, TbMoonStars, TbDeviceDesktop, TbSettings } from 'react-icons/tb'
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
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { useSettings } from '@repo/ui/hooks/useSettings'
import type { Mode } from '@repo/ui/types'

const UserDropdown = () => {
  // Hooks
  const { setTheme, systemTheme } = useTheme()
  const { settings, updateSettings } = useSettings()
  const isDark = useMedia('(prefers-color-scheme: dark)', systemTheme === 'dark')

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
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-is-[200px]'>
        <DropdownMenuItem asChild>
          <Link href='admin' className='flex gap-2'>
            <TbUser className='text-xl' />
            <span className='flex-1 truncate'>My Profile</span>
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
            <span className='flex-1 truncate'>User Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href='/admin' className='flex gap-2'>
            <TbSettings className='text-xl' />
            <span className='flex-1 truncate'>Admin Dashboard</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserDropdown
