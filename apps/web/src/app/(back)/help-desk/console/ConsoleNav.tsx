'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TbAlertTriangle, TbBook, TbBuilding, TbChartBar, TbCode, TbExternalLink, TbLayoutDashboard, TbSettings } from 'react-icons/tb'
import { cn } from '@repo/ui/lib/utils'

type Show = { incidents: boolean; knowledge: boolean; development: boolean; analytics: boolean; settings: boolean }

const ConsoleNav = ({ show }: { show: Show }) => {
  const pathname = usePathname()

  const items = [
    { href: '/help-desk/console', label: 'Tickets', icon: TbLayoutDashboard, visible: true, exact: true },
    { href: '/help-desk/console/incidents', label: 'Incidents & Status', icon: TbAlertTriangle, visible: show.incidents },
    { href: '/help-desk/console/knowledge', label: 'Knowledge', icon: TbBook, visible: show.knowledge },
    { href: '/help-desk/console/development', label: 'Development', icon: TbCode, visible: show.development },
    { href: '/help-desk/console/analytics', label: 'Analytics', icon: TbChartBar, visible: show.analytics },
    { href: '/help-desk/console/tenants', label: 'Tenants', icon: TbBuilding, visible: true },
    { href: '/help-desk/console/settings', label: 'Settings', icon: TbSettings, visible: show.settings }
  ].filter(item => item.visible)

  return (
    <nav aria-label='Support Console' className='-mx-1 flex gap-1 overflow-x-auto border-b pb-px'>
      {items.map(item => {
        const active = item.exact ? pathname === item.href || pathname.startsWith('/help-desk/console/tickets') : pathname.startsWith(item.href)
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
      <Link href='/help-desk' className='text-textSecondary hover:text-textPrimary ml-auto flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium'>
        <TbExternalLink className='text-base' />
        Customer Help Center
      </Link>
    </nav>
  )
}

export default ConsoleNav
