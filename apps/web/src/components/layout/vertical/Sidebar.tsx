'use client'

// React Imports
import type { HTMLAttributeAnchorTarget, ReactNode } from 'react'

// Next Imports
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import {
  TbCrown,
  TbDashboard,
  TbExternalLink,
  TbFileText,
  TbHome,
  TbLayoutGridAdd,
  TbListDetails,
  TbLock,
  TbSettings,
  TbSettingsAutomation,
  TbStar,
  TbTemplate,
  TbUser,
  TbUsers,
  TbWallet
} from 'react-icons/tb'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar
} from '@repo/ui/components/ui/sidebar'
import { useAuthContext } from '@repo/auth/AuthProvider'
import { AnyPermissionGuard, PermissionGuard } from '@repo/rbac/components'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
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

const AppSidebar = ({\n  roles,\n  permissions,\n  forgePlatformRole\n}: {\n  roles?: string[]\n  permissions: string[]\n  forgePlatformRole?: string | null\n}) => {
  // Hooks
  const { isImpersonating } = useAuthContext()
  const { isMobile, state } = useSidebar()
  const { t } = useTranslation()

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
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <MenuButton href={roles?.includes('admin') ? '/admin' : '/dashboard'} tooltip={t('layout:dashboard')}>
                <TbDashboard />
                <span>
                  <Trans i18nKey='layout:dashboard' />
                </span>
              </MenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuButton href='/my-profile' tooltip={t('layout:myProfile')}>
                <TbUser />
                <span>
                  <Trans i18nKey='layout:myProfile' />
                </span>
              </MenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuButton href='/billing' tooltip={t('layout:billing')}>
                <TbFileText />
                <span>
                  <Trans i18nKey='layout:billing' />
                </span>
              </MenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuButton href='/' target='_blank' tooltip={t('layout:landingPage')}>
                <TbHome />
                <span>
                  <Trans i18nKey='layout:landingPage' />
                </span>
              </MenuButton>
              <SidebarMenuAction className='pointer-events-none hover:bg-transparent [&>svg]:size-5'>
                <TbExternalLink />
              </SidebarMenuAction>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
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
            </SidebarMenu>
          </SidebarGroup>
        )}
        <PermissionGuard permissions={permissions} permission='view_settings'>
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? (
                <Trans i18nKey='layout:settings' />
              ) : (
                <SidebarSeparator className='!is-8' />
              )}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/admin/settings/general-settings' tooltip={t('layout:generalSettings')}>
                  <TbSettings />
                  <span>
                    <Trans i18nKey='layout:generalSettings' />
                  </span>
                </MenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <MenuButton href='/admin/settings/payment-providers' tooltip={t('layout:paymentProviders')}>
                  <TbWallet />
                  <span>
                    <Trans i18nKey='layout:paymentProviders' />
                  </span>
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
              {state === 'expanded' || isMobile ? (
                <Trans i18nKey='layout:userManagement' />
              ) : (
                <SidebarSeparator className='!is-8' />
              )}
            </SidebarGroupLabel>
            <SidebarMenu>
              <PermissionGuard permissions={permissions} permission='view_users'>
                <SidebarMenuItem>
                  <MenuButton href='/admin/users' exactMatch={false} tooltip={t('layout:users')}>
                    <TbUsers />
                    <span>
                      <Trans i18nKey='layout:users' />
                    </span>
                  </MenuButton>
                </SidebarMenuItem>
              </PermissionGuard>
              <PermissionGuard permissions={permissions} permission='view_roles'>
                <SidebarMenuItem>
                  <MenuButton href='/admin/roles' exactMatch={false} tooltip={t('layout:roles')}>
                    <TbCrown />
                    <span>
                      <Trans i18nKey='layout:roles' />
                    </span>
                  </MenuButton>
                </SidebarMenuItem>
              </PermissionGuard>
              <PermissionGuard permissions={permissions} permission='view_permission'>
                <SidebarMenuItem>
                  <MenuButton href='/admin/permissions' exactMatch={false} tooltip={t('layout:permissions')}>
                    <TbLock />
                    <span>
                      <Trans i18nKey='layout:permissions' />
                    </span>
                  </MenuButton>
                </SidebarMenuItem>
              </PermissionGuard>
            </SidebarMenu>
          </SidebarGroup>
        </AnyPermissionGuard>
        <PermissionGuard permissions={permissions} permission='view_faqs'>
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? (
                <Trans i18nKey='layout:faqs' />
              ) : (
                <SidebarSeparator className='!is-8' />
              )}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/admin/faqs/category' exactMatch={false} tooltip={t('layout:faqCategory')}>
                  <TbLayoutGridAdd />
                  <span>
                    <Trans i18nKey='layout:category' />
                  </span>
                </MenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <MenuButton href='/admin/faqs/faq' exactMatch={false} tooltip={t('layout:faqs')}>
                  <TbListDetails />
                  <span>
                    <Trans i18nKey='layout:faq' />
                  </span>
                </MenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </PermissionGuard>
        <PermissionGuard permissions={permissions} permission='view_reviews'>
          <SidebarGroup>
            <SidebarGroupLabel className='text-nowrap'>
              {state === 'expanded' || isMobile ? (
                <Trans i18nKey='layout:reviews' />
              ) : (
                <SidebarSeparator className='!is-8' />
              )}
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <MenuButton href='/admin/reviews/platform' exactMatch={false} tooltip={t('layout:reviewPlatform')}>
                  <TbTemplate />
                  <span>
                    <Trans i18nKey='layout:platform' />
                  </span>
                </MenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <MenuButton href='/admin/reviews/review' exactMatch={false} tooltip={t('layout:reviews')}>
                  <TbStar />
                  <span>
                    <Trans i18nKey='layout:review' />
                  </span>
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
