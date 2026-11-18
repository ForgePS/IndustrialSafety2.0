'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, HTMLAttributeAnchorTarget, ReactNode } from 'react'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  TbAlertTriangle,
  TbBuildingFactory2,
  TbChevronRight,
  TbClipboardCheck,
  TbDashboard,
  TbFolder,
  TbHeadset,
  TbLock,
  TbSettings,
  TbSettingsAutomation,
  TbShieldCheck,
  TbSparkles,
  TbTool,
  TbUrgent,
  TbUser,
  TbUsers
} from 'react-icons/tb'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar
} from '@repo/ui/components/ui/sidebar'

import { useAuthContext } from '@repo/auth/AuthProvider'
import { cn } from '@repo/ui/lib/utils'
import type { SidebarMenuButtonProps } from '@repo/ui/components/ui/sidebar'

import { activeRoute, groupNavigation } from '@/lib/navigationGroups'

import Logo from './Logo'

type MenuButtonProps = SidebarMenuButtonProps & {
  children: ReactNode
  href?: string
  exactMatch?: boolean
  target?: HTMLAttributeAnchorTarget
}

type TenantNavigationItem = {
  id: string
  key: string
  label: string
  description: string | null
  route: string | null
  category: string
  sortOrder: number
}

const MenuButton = ({ children, href, target = '_self', exactMatch = true, ...props }: MenuButtonProps) => {
  const pathname = usePathname()

  return (
    <SidebarMenuButton
      {...(!!href && {
        isActive: exactMatch ? pathname === href : pathname.startsWith(href),
        asChild: true
      })}
      {...props}
    >
      {href ? (
        <Link href={href} target={target}>
          {children}
        </Link>
      ) : (
        children
      )}
    </SidebarMenuButton>
  )
}

const GROUP_ICONS: Record<string, ComponentType> = {
  'People & Training': TbUsers,
  'Incident & Claims': TbAlertTriangle,
  'Risk & Prevention': TbShieldCheck,
  'Compliance Programs': TbClipboardCheck,
  'Equipment & Operations': TbTool,
  'High-Risk Work': TbLock,
  'Facility & Operations Safety': TbBuildingFactory2,
  'Emergency Management': TbUrgent,
  'Forge AI': TbSparkles,
  'System Tools': TbSettings
}

// Which group is open, kept per browser like 1.0's menu.
const OPEN_GROUP_KEY = 'forge2-nav-open-group'

const readOpenGroup = () => {
  try {
    return window.localStorage.getItem(OPEN_GROUP_KEY)
  } catch {
    return null
  }
}

const storeOpenGroup = (group: string | null) => {
  try {
    if (group) window.localStorage.setItem(OPEN_GROUP_KEY, group)
    else window.localStorage.removeItem(OPEN_GROUP_KEY)
  } catch {
    // private mode or storage blocked: the menu still works, it just won't remember
  }
}

/**
 * The tenant's menu in 1.0's groups. One group open at a time; the group holding the current page
 * opens when the page changes, and the person's own open/close choice is remembered otherwise.
 */
const GroupedNavigation = ({ items }: { items: TenantNavigationItem[] }) => {
  const pathname = usePathname()
  const { state, isMobile, setOpen } = useSidebar()
  const groups = useMemo(() => groupNavigation(items), [items])
  const current = activeRoute(pathname, items.map(item => item.route))
  const currentGroup = groups.find(group => group.items.some(item => item.route === current))?.name ?? null
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (lastPath.current === null) {
      lastPath.current = pathname
      setOpenGroup(currentGroup ?? readOpenGroup())

      return
    }

    if (lastPath.current !== pathname) {
      lastPath.current = pathname
      if (currentGroup) setOpenGroup(currentGroup)
    }
  }, [pathname, currentGroup])

  const toggle = (name: string) => {
    // Collapsed to icons, a group's entries are hidden, so open the sidebar and the group.
    if (state === 'collapsed' && !isMobile) {
      setOpen(true)
      setOpenGroup(name)
      storeOpenGroup(name)

      return
    }

    const next = openGroup === name ? null : name

    setOpenGroup(next)
    storeOpenGroup(next)
  }

  return <>{groups.map(group => {
    const Icon = GROUP_ICONS[group.name] ?? TbFolder
    const open = openGroup === group.name

    return (
      <SidebarMenuItem key={group.name}>
        <SidebarMenuButton
          tooltip={group.name}
          isActive={state === 'collapsed' && group.name === currentGroup}
          aria-expanded={open}
          onClick={() => toggle(group.name)}
        >
          <Icon />
          <span>{group.name}</span>
          <TbChevronRight
            aria-hidden
            className={cn('mis-auto transition-transform duration-200', { 'rotate-90': open })}
          />
        </SidebarMenuButton>
        {open ? (
          <SidebarMenuSub>
            {group.items.map(item => (
              <SidebarMenuSubItem key={item.id}>
                <SidebarMenuSubButton asChild size='sm' isActive={item.route === current}>
                  <Link href={item.route || '/dashboard'}>
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>
    )
  })}</>
}

const AppSidebar = ({
  forgePlatformRole,
  tenantNavigation = [],
  activeOrganizationName,
  helpdeskConsole = false
}: {
  roles?: string[]
  permissions: string[]
  forgePlatformRole?: string | null
  tenantNavigation?: TenantNavigationItem[]
  activeOrganizationName?: string | null
  helpdeskConsole?: boolean
}) => {
  const { isImpersonating } = useAuthContext()
  const { isMobile, state } = useSidebar()

  return (
    <Sidebar
      collapsible='icon'
      className={cn('transition-[inset-block-start,block-size] duration-300 ease-in-out', {
        'block-start-[54px] !bs-[calc(100%-54px)]': isImpersonating
      })}
    >
      <SidebarHeader>
        <div
          className={cn('bs-[2.0625rem] mli-3 flex items-center justify-start overflow-hidden transition-[margin]', {
            'mis-2 mie-0': state === 'collapsed'
          })}
        >
          <Link href='/dashboard'>
            <Logo />
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {activeOrganizationName ? (
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? activeOrganizationName : <SidebarSeparator className='!is-8' />}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/dashboard' tooltip='Dashboard'>
                  <TbDashboard />
                  <span>Dashboard</span>
                </MenuButton>
              </SidebarMenuItem>

              <GroupedNavigation items={tenantNavigation} />

              <SidebarMenuItem>
                <MenuButton href='/my-profile' tooltip='My Profile'>
                  <TbUser />
                  <span>My Profile</span>
                </MenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        {forgePlatformRole && (
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? 'Forge Platform' : <SidebarSeparator className='!is-8' />}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/admin/creator' exactMatch={false} tooltip='Forge Creator 2.0'>
                  <TbSettingsAutomation />
                  <span>Forge Creator 2.0</span>
                </MenuButton>
              </SidebarMenuItem>
              {helpdeskConsole ? (
                <SidebarMenuItem>
                  <MenuButton href='/help-desk/console' exactMatch={false} tooltip='Help Desk Console'>
                    <TbHeadset />
                    <span>Help Desk Console</span>
                  </MenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
