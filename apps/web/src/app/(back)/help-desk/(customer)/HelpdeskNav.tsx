'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TbBook, TbHeadset, TbMessageQuestion, TbSpeakerphone, TbStatusChange, TbTicket } from 'react-icons/tb'
import { cn } from '@repo/ui/lib/utils'

const items = [
  { href: '/help-desk', label: 'Help Center', icon: TbBook, exact: true },
  { href: '/help-desk/ask', label: 'Ask Forge', icon: TbMessageQuestion },
  { href: '/help-desk/tickets', label: 'My Tickets', icon: TbTicket },
  { href: '/help-desk/status', label: 'Service Status', icon: TbStatusChange },
  { href: '/help-desk/announcements', label: 'Announcements', icon: TbSpeakerphone }
]

const HelpdeskNav = ({ showConsole }: { showConsole: boolean }) => {
  const pathname = usePathname()

  return (
    <nav aria-label='Help Desk' className='-mx-1 flex gap-1 overflow-x-auto border-b pb-px'>
      {items.map(item => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent'
            )}
          >
            <Icon className='text-base' />
            {item.label}
          </Link>
        )
      })}
      {showConsole ? (
        <Link href='/help-desk/console' className='text-textSecondary hover:text-textPrimary ml-auto flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium'>
          <TbHeadset className='text-base' />
          Support Console
        </Link>
      ) : null}
    </nav>
  )
}

export default HelpdeskNav
