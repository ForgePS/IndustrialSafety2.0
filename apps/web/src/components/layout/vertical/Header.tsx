// Third-party Imports
import { clsx } from 'clsx'
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

// Util Imports
import { getSearchData } from '@/utils/searchData'

// Utility function to transform search data
const transformSearchData = (data: SearchDataItem[]): SearchDataProps[] => {
  return data.map(item => {
    let url = item.url

    if (item.dynamicUrl && item.baseUrl !== undefined) {
      url = `/${item.adminRoute ? 'admin' : 'dashboard'}${item.baseUrl}`
    }

    return {
      ...item,
      url: url || '/' // Fallback to root URL if no URL is available
    }
  })
}

const Header = async () => {
  const {
    data: { user }
  } = await getAuthUser()

  const userRoles = user?.user_metadata.roles
  const permissions = user?.user_metadata.permissions
  const roles = user?.user_metadata.roles

  // Filter search data based on permissions
  const searchResults = getSearchData(permissions)

  const permissionFilteredData = searchResults.filter(item => {
    if (!item.permission) return true

    return hasPermission(permissions, item.permission)
  })

  return (
    <LayoutHeader>
      <div className={clsx(verticalLayoutClasses.headerContent, 'is-full flex items-center justify-between gap-4')}>
        <div className='flex items-center gap-2.5'>
          <SidebarTrigger className='-mis-2.5 shrink-0' />
          <Separator orientation='vertical' className='!bs-6' />
          <Search data={transformSearchData(permissionFilteredData)} roles={roles} />
        </div>
        <div className='flex items-center gap-5'>
          <LanguageDropdown />
          <UserDropdown user={user} roles={userRoles} />
        </div>
      </div>
    </LayoutHeader>
  )
}

export default Header
