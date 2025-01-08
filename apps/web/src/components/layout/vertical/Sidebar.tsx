'use client'

// React Imports
import { useState } from 'react'
import type { HTMLAttributeAnchorTarget, ReactNode } from 'react'

// Next Imports
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import {
  TbCommand,
  TbCrown,
  TbDashboard,
  TbFileText,
  TbLayoutGridAdd,
  TbListDetails,
  TbLock,
  TbPlus,
  TbSelector,
  TbSettings,
  TbStack2,
  TbStar,
  TbUser,
  TbUsers,
  TbWallet,
  TbWaveSine
} from 'react-icons/tb'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@repo/ui/components/ui/dropdown-menu'
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
import { AnyPermissionGuard, PermissionGuard } from '@repo/rbac/components'
import { cn } from '@repo/ui/lib/utils'
import type { SidebarMenuButtonProps } from '@repo/ui/components/ui/sidebar'

// Component Imports
import Logo from './Logo'

type MenuButtonProps = SidebarMenuButtonProps & {
  children: ReactNode
  href?: string
  exactMatch?: boolean
  target?: HTMLAttributeAnchorTarget
}

// Vars
const teams = [
  {
    name: 'Acme Inc',
    logo: TbStack2,
    plan: 'Enterprise'
  },
  {
    name: 'Acme Corp.',
    logo: TbWaveSine,
    plan: 'Startup'
  },
  {
    name: 'Evil Corp.',
    logo: TbCommand,
    plan: 'Free'
  }
]

// Custom SidebarMenuButton Component
const MenuButton = ({ children, href, target = '_self', exactMatch = true, ...props }: MenuButtonProps) => {
  // Hooks
  const pathname = usePathname()

  return (
    <SidebarMenuButton
      {...(!!href && {
        isActive: exactMatch ? pathname === href : pathname.includes(href),
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

const AppSidebar = ({ roles, permissions, appName }: { roles?: string[]; permissions: string[]; appName: string }) => {
  // States
  const [activeTeam, setActiveTeam] = useState(teams[0])

  // Hooks
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
            <Logo appName={appName} />
          </Link>
        </div>
        <SidebarSeparator className='!is-auto -mli-3 mlb-3.5' />
        <SidebarMenu className='mlb-[.3125rem]'>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size='lg'
                  className='transition-[padding] group-data-[collapsible=icon]:!p-1.5'
                  tooltip='Teams'
                >
                  <Avatar size='lg'>
                    <AvatarFallback>
                      <activeTeam.logo className='text-xl' />
                    </AvatarFallback>
                  </Avatar>
                  <div className='grid flex-1 text-left text-sm leading-tight'>
                    <span className='truncate font-semibold'>{activeTeam.name}</span>
                    <span className='truncate text-xs'>{activeTeam.plan}</span>
                  </div>
                  <TbSelector className='mis-auto text-xl' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className='is-[--radix-dropdown-menu-trigger-width] !min-is-56 rounded-lg'
                align='start'
                side={state === 'collapsed' ? 'right' : 'bottom'}
                sideOffset={4}
              >
                <DropdownMenuLabel className='text-xs'>Teams</DropdownMenuLabel>
                {teams.map((team, index) => (
                  <DropdownMenuItem key={team.name} onClick={() => setActiveTeam(team)} className='gap-2 p-2'>
                    <div className='flex size-6 items-center justify-center rounded-sm border'>
                      <team.logo className='shrink-0 text-xl' />
                    </div>
                    {team.name}
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className='gap-2 p-2'>
                  <div className='bg-background flex size-6 items-center justify-center rounded-md border'>
                    <TbPlus className='text-xl' />
                  </div>
                  <div className='font-medium'>Add team</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <MenuButton href={roles?.includes('admin') ? '/admin' : '/dashboard'} tooltip='Dashboard'>
                <TbDashboard />
                <span>Dashboard</span>
              </MenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuButton href={`/${roles?.includes('admin') ? 'admin' : 'dashboard'}/my-profile`} tooltip='My Profile'>
                <TbUser />
                <span>My Profile</span>
              </MenuButton>
            </SidebarMenuItem>
            {!roles?.includes('admin') && (
              <SidebarMenuItem>
                <MenuButton href='/dashboard/billing' tooltip='Billing'>
                  <TbFileText />
                  <span>Billing</span>
                </MenuButton>
              </SidebarMenuItem>
            )}
            <PermissionGuard permissions={permissions} permission='view_reviews'>
              <SidebarMenuItem>
                <MenuButton href='/admin/reviews' exactMatch={false} tooltip='Reviews'>
                  <TbStar />
                  <span>Reviews</span>
                </MenuButton>
              </SidebarMenuItem>
            </PermissionGuard>
          </SidebarMenu>
        </SidebarGroup>
        <PermissionGuard permissions={permissions} permission='view_settings'>
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? 'Settings' : <SidebarSeparator className='!is-8' />}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/admin/settings/general-settings' tooltip='General Settings'>
                  <TbSettings />
                  <span>General Settings</span>
                </MenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <MenuButton href='/admin/settings/payment-providers' tooltip='Payment Providers'>
                  <TbWallet />
                  <span>Payment Providers</span>
                </MenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </PermissionGuard>
        <AnyPermissionGuard
          permissions={permissions}
          requiredPermissions={['view_users', 'view_permission', 'view_roles']}
        >
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? 'User Management' : <SidebarSeparator className='!is-8' />}
            </SidebarGroupLabel>
            <SidebarMenu>
              <PermissionGuard permissions={permissions} permission='view_users'>
                <SidebarMenuItem>
                  <MenuButton href='/admin/users' exactMatch={false} tooltip='Users'>
                    <TbUsers />
                    <span>Users</span>
                  </MenuButton>
                </SidebarMenuItem>
              </PermissionGuard>
              <PermissionGuard permissions={permissions} permission='view_roles'>
                <SidebarMenuItem>
                  <MenuButton href='/admin/roles' exactMatch={false} tooltip='Roles'>
                    <TbCrown />
                    <span>Roles</span>
                  </MenuButton>
                </SidebarMenuItem>
              </PermissionGuard>
              <PermissionGuard permissions={permissions} permission='view_permission'>
                <SidebarMenuItem>
                  <MenuButton href='/admin/permissions' exactMatch={false} tooltip='Permissions'>
                    <TbLock />
                    <span>Permissions</span>
                  </MenuButton>
                </SidebarMenuItem>
              </PermissionGuard>
            </SidebarMenu>
          </SidebarGroup>
        </AnyPermissionGuard>
        <PermissionGuard permissions={permissions} permission='view_faqs'>
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? 'FAQs' : <SidebarSeparator className='!is-8' />}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/admin/faqs/category' exactMatch={false} tooltip='FAQ Category'>
                  <TbLayoutGridAdd />
                  <span>Category</span>
                </MenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <MenuButton href='/admin/faqs/faq' exactMatch={false} tooltip='FAQs'>
                  <TbListDetails />
                  <span>FAQ</span>
                </MenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </PermissionGuard>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
