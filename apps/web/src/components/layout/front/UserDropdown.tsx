'use client'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbMoodSmile, TbSettings } from 'react-icons/tb'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
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
          <div>
            <Avatar size='lg'>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href='/dashboard' className='flex gap-2'>
            <TbMoodSmile className='text-xl' />
            <span>User Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className='flex gap-2' asChild>
          <Link href='/admin' className='flex gap-2'>
            <TbSettings className='text-xl' />
            <span>Admin Panel</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserDropdown
