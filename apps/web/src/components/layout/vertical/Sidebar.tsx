'use client'

import type { HTMLAttributeAnchorTarget, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  TbAdjustments,
  TbCircle,
  TbDashboard,
  TbSettingsAutomation,
  TbUser
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
  SidebarRail,
  SidebarSeparator,
  useSidebar
} from '@repo/ui/components/ui/sidebar'
import { useAuthContext } from '@repo/auth/AuthProvider'
import { cn } from '@repo/ui/lib/utils'
import type { SidebarMenuButtonProps } from '@repo/ui/components/ui/sidebar'
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

const AppSidebar = ({
  roles,
  permissions: _permissions,
  forgePlatformRole,
  tenantNavigation = [],
  activeOrganizationName
}: {
  roles?: string[]
  permissions: string[]
  forgePlatformRole?: string | null
  tenantNavigation?: TenantNavigationItem[]
  activeOrganizationName?: string | null
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
          <Link href={roles?.includes('admin') ? '/admin' : '/dashboard'}>
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

              {tenantNavigation.map(item => (
                <SidebarMenuItem key={item.id}>
                  <MenuButton href={item.route || '/dashboard'} exactMatch={false} tooltip={item.label}>
                    <TbCircle />
                    <span>{item.label}</span>
                  </MenuButton>
                </SidebarMenuItem>
              ))}

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
              <SidebarMenuItem>
                <MenuButton href='/admin/creator/experience' exactMatch={false} tooltip='Experience Builder'>
                  <TbAdjustments />
                  <span>Experience Builder</span>
                </MenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
