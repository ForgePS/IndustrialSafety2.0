// Third-party Imports
import Link from 'next/link'
import { clsx } from 'clsx'
import { TbBell, TbLifebuoy } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import LayoutHeader from '@repo/ui/layouts/components/vertical/Header'
import { Separator } from '@repo/ui/components/ui/separator'
import { SidebarTrigger } from '@repo/ui/components/ui/sidebar'
import { verticalLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import type { SearchDataProps } from '@repo/ui/components/search'
import { hasPermission } from '@repo/rbac/utils'
import Search from '@repo/ui/components/search'

// Type Imports
import type { SearchDataItem } from '@/assets/data/searchData'

// Component Imports
import LanguageDropdown from '@components/LanguageDropdown'
import UserDropdown from './UserDropdown'
import TenantSwitcher from './TenantSwitcher'
import { unreadCount } from '@/lib/forgeNotifications'

// Data
import { searchData } from '@/assets/data/searchData'

// Utility function to transform search data
const transformSearchData = (data: SearchDataItem[]): SearchDataProps[] => {
  return data.map(item => {
    let url = item.url

    if (item.dynamicUrl && item.baseUrl !== undefined) {
      url = `/${item.adminRoute ? 'admin' : 'dashboard'}${item.baseUrl}`
    }

    return {
      ...item,
      url: url || '/'
    }
  })
}

const Header = async ({
  organizations = [],
  activeOrganizationId
}: {
  organizations?: Array<{ id: string; name: string; slug: string; membershipRole: string }>
  activeOrganizationId?: string | null
}) => {
  const {
    data: { user }
  } = await getAuthUser()

  const unread = user ? await unreadCount(user.id) : 0
  const userRoles = user?.user_metadata.roles
  const permissions = user?.user_metadata.permissions
  const roles = user?.user_metadata.roles

  const permissionFilteredData = searchData.filter(item => {
    if (!item.permission) return true

    return hasPermission(permissions, item.permission)
  })

  return (
    <LayoutHeader>
      <div className={clsx(verticalLayoutClasses.headerContent, 'is-full flex items-center justify-between gap-4')}>
        <div className='flex min-w-0 items-center gap-2.5'>
          <SidebarTrigger className='-mis-2.5 shrink-0' />
          <Separator orientation='vertical' className='!bs-6' />
          <TenantSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
          <Search data={transformSearchData(permissionFilteredData)} roles={roles} />
        </div>
        <div className='flex items-center gap-3 sm:gap-5'>
          <Button variant='ghost' size='sm' asChild className='hidden sm:inline-flex'>
            <Link href='/help-desk'>
              <TbLifebuoy />
              Need Help?
            </Link>
          </Button>
          <Button variant='ghost' size='icon' asChild className='relative'>
            <Link href='/notifications' aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
              <TbBell className='text-xl' />
              {unread ? (
                <span className='bg-destructive absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold leading-[18px] text-white'>
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </Link>
          </Button>
          <LanguageDropdown />
          <UserDropdown user={user} roles={userRoles} />
        </div>
      </div>
    </LayoutHeader>
  )
}

export default Header
