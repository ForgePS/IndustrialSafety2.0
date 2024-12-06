// Third-party Imports
import { clsx } from 'clsx'
import LayoutHeader from '@repo/ui/layouts/components/vertical/Header'
import { Separator } from '@repo/ui/components/ui/separator'
import { SidebarTrigger } from '@repo/ui/components/ui/sidebar'
import Search from '@repo/ui/components/search'
import { verticalLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'
import { getAuthUser, getPublicUser, getUserRoles } from '@repo/supabase/serverHelpers'

// Component Imports
import UserDropdown from './UserDropdown'

const Header = async () => {
  const {
    data: { user }
  } = await getAuthUser()

  const { data: userRecord } = await getPublicUser()
  const { data: userRoles } = await getUserRoles()

  const roles: string[] | undefined = userRoles?.map(role => role.roles.role)

  return (
    <LayoutHeader>
      <div className={clsx(verticalLayoutClasses.headerContent, 'is-full flex items-center justify-between gap-4')}>
        <div className='flex items-center gap-2.5'>
          <SidebarTrigger className='-mis-2.5 shrink-0' />
          <Separator orientation='vertical' className='!bs-6' />
          <Search data={[]} />
        </div>
        <div className='flex items-center gap-4'>
          <UserDropdown user={user} userTableData={userRecord} roles={roles} />
        </div>
      </div>
    </LayoutHeader>
  )
}

export default Header
