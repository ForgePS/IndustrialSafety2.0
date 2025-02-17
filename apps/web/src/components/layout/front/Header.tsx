// Next Imports
import Link from 'next/link'

// Third-party Imports
import { clsx } from 'clsx'
import LayoutHeader from '@repo/ui/layouts/components/front/Header'
import { Button } from '@repo/ui/components/ui/button'
import { getAuthUser, getPublicGeneralSettings } from '@repo/supabase/serverHelpers'
import { frontLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'
import Trans from '@repo/i18n/Trans'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Logo from './Logo'
import FrontMenu from './FrontMenu'
import ModeDropdown from '@components/layout/ModeDropdown'
import UserDropdown from './UserDropdown'
import LanguageDropdown from '@components/LanguageDropdown'

const Header = async () => {
  // Vars
  const {
    data: { user }
  } = await getAuthUser()

  const userRoles = user?.user_metadata.roles
  const { data: settings_configuration } = await getPublicGeneralSettings()

  const isBlogEnabled = (JSON.parse(settings_configuration?.value) as SettingsConfiguration['general_settings'])
    .pages_components.blog_enabled

  return (
    <LayoutHeader>
      <div className={clsx(frontLayoutClasses.headerContent, 'is-full flex items-center justify-between gap-4')}>
        <div className='max-xl:-mis-2.5 max-xl:flex max-xl:items-center max-xl:gap-4 max-sm:gap-2 xl:hidden'>
          <FrontMenu isBlogEnabled={isBlogEnabled} />
          <Link href='/'>
            <Logo logoId='FrontMenu-SmallScreen' />
          </Link>
        </div>
        <Link href='/' className='max-xl:hidden'>
          <Logo logoId='FrontMenu-LargeScreen' />
        </Link>
        <div className='flex items-center gap-2 sm:gap-5'>
          <div className='max-xl:hidden'>
            <FrontMenu isBlogEnabled={isBlogEnabled} />
          </div>
          <div className='flex items-center gap-1 max-[432px]:hidden sm:gap-2'>
            <LanguageDropdown />
            <ModeDropdown />
          </div>
          <div className='min-[433px]:hidden'>
            <ModeDropdown />
          </div>
          {user ? (
            <UserDropdown user={user} roles={userRoles} />
          ) : (
            <Button size='sm' asChild>
              <Link href='/auth/login'>
                <Trans i18nKey='layout:signIn' />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </LayoutHeader>
  )
}

export default Header
