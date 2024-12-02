// Next Imports
import Link from 'next/link'

// Third-party Imports
import { clsx } from 'clsx'
import LayoutHeader from '@repo/ui/layouts/components/front/Header'
import { frontLayoutClasses } from '@repo/ui/layouts/utils/layoutClasses'

// Component Imports
import Logo from './Logo'
import FrontMenu from './FrontMenu'
import UserDropdown from './UserDropdown'

const Header = () => {
  // Vars
  const appName = 'App Name'
  const isBlogEnabled = true

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
          <UserDropdown />
        </div>
      </div>
    </LayoutHeader>
  )
}

export default Header
