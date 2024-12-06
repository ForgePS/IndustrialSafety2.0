// Next Imports
import Link from 'next/link'

// Third-party Imports
import { clsx } from 'clsx'
import LayoutHeader from '@repo/ui/layouts/components/front/Header'
import { Button } from '@repo/ui/components/ui/button'
import { getAuthUser, getPublicGeneralSettings, getPublicUser, getUserRoles } from '@repo/supabase/serverHelpers'
import { frontLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Logo from './Logo'
import FrontMenu from './FrontMenu'
import ModeDropdown from '@components/layout/ModeDropdown'
import UserDropdown from './UserDropdown'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const Header = async () => {
  // Vars
  const appName = await getAppName()

  const {
    data: { user }
  } = await getAuthUser()

  const { data: userRecord } = await getPublicUser()
  const { data: userRoles } = await getUserRoles()
  const { data: settings_configuration } = await getPublicGeneralSettings()

  const roles: string[] | undefined = userRoles?.map(role => role.roles.role)

  const isBlogEnabled = (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings'])
    .pages_components.blog_enabled

  return (
    <LayoutHeader>
      <div className={clsx(frontLayoutClasses.headerContent, 'is-full flex items-center justify-between gap-4')}>
        <div className='max-xl:-mis-2.5 max-xl:flex max-xl:items-center max-xl:gap-4 xl:hidden'>
          <FrontMenu isBlogEnabled={isBlogEnabled} />
          <Link href='/'>
            <Logo appName={appName} logoId='FrontMenu-SmallScreen' />
          </Link>
        </div>
        <Link href='/' className='max-xl:hidden'>
          <Logo appName={appName} logoId='FrontMenu-LargeScreen' />
        </Link>
        <div className='flex items-center gap-5'>
          <div className='max-xl:hidden'>
            <FrontMenu isBlogEnabled={isBlogEnabled} />
          </div>
          <ModeDropdown />
          {user ? (
            <UserDropdown user={user} userTableData={userRecord} roles={roles} />
          ) : (
            <Button size='sm' asChild>
              <Link href='/auth/login'>Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </LayoutHeader>
  )
}

export default Header
