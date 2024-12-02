'use client'

// Next Imports
import Link from 'next/link'

// Third-party Imports
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

const UserDropdown = () => {
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
        <DropdownMenuRadioGroup value='light' className='flex justify-between gap-1'>
          <DropdownMenuRadioItem value='light' className='mbs-0 cursor-pointer'>
            <TbSun className='text-xl' />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='dark' className='mbs-0 cursor-pointer'>
            <TbMoonStars className='text-xl' />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='system' className='mbs-0 cursor-pointer'>
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
