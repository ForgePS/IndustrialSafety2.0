// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'
import LeftSection from '@repo/ui/auth/LeftSection'
import OauthProviders from '@repo/ui/providers/OauthProviders'
import { createServiceRoleClient } from '@repo/supabase/server'
import { cn } from '@repo/ui/lib/utils'

// Component Imports
import Logo from '@components/layout/front/Logo'
import PasswordSignInForm from './PasswordSignInForm'

// Util Imports
import { getAppName } from '@/utils/getAppName'

// Config Imports
import authConfig from '@configs/authConfig'

const Login = async () => {
  // Vars
  const appName = await getAppName()
  const renderMagicLink = authConfig.providers.magicLink
  const renderPassword = authConfig.providers.password
  const renderOAuth = authConfig.providers.oAuth.length > 0

  const supabase = createServiceRoleClient()

  const {
    data: { users }
  } = await supabase.auth.admin.listUsers()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen relative basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='pbs-8 is-full absolute'>
          <Link href='/' className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex items-center gap-2'>
            <TbChevronLeft className='is-[22px] bs-[22px] text-textSecondary' />
            <span className='text-textSecondary'>Back to the website</span>
          </Link>
        </div>
        <div className='plb-[7rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>{`Sign in to ${appName}`}</h1>
              <p className='text-textSecondary'>Ship Faster and Focus on Growth</p>
            </div>
            {renderMagicLink && (
              <p className='text-textSecondary flex gap-x-1'>
                <span>Sign in with</span>
                <Link href='/auth/magic-link' className='text-primary'>
                  Magic Link
                </Link>
              </p>
            )}
            <div className='flex flex-col gap-4'>
              {renderPassword && <PasswordSignInForm appName={appName} users={users} />}
              {!renderPassword && !renderMagicLink ? null : (
                <p
                  className={cn('flex flex-wrap items-center justify-center gap-1 text-base', {
                    'justify-start': !renderPassword
                  })}
                >
                  <span className='text-textSecondary'>New on our platform?</span>
                  <Link href='/auth/register' className='text-primary'>
                    Create an account
                  </Link>
                </p>
              )}
              {renderOAuth && (
                <>
                  {!renderPassword && !renderMagicLink ? null : (
                    <div className='flex items-center gap-4'>
                      <hr className='flex-1' />
                      <span className='text-textPrimary text-base'>or</span>
                      <hr className='flex-1' />
                    </div>
                  )}
                  <OauthProviders providers={authConfig.providers.oAuth} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
