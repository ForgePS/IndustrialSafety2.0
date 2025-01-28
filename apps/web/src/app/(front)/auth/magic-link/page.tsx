// Next Imports
import Link from 'next/link'

// Third-party Imports
import LeftSection from '@repo/ui/auth/LeftSection'
import OauthProviders from '@repo/ui/providers/OauthProviders'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import MagicLinkForm from './MagicLinkForm'

// Config Imports
import authConfig from '@configs/authConfig'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const MagicLink = async () => {
  const appName = await getAppName()
  const renderOAuth = authConfig.providers.oAuth.length > 0

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='plb-[12rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='auth:magicLinkTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='auth:magicLinkDescription' />
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <MagicLinkForm />
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>
                  <Trans i18nKey='auth:magicLinkPasswordText' />
                </span>
                <Link href='/auth/login' className='text-primary'>
                  <Trans i18nKey='auth:magicLinkPasswordButton' />
                </Link>
              </p>
              {renderOAuth && (
                <>
                  <div className='flex items-center gap-4'>
                    <hr className='flex-1' />
                    <span className='text-textPrimary text-base'>
                      <Trans i18nKey='auth:dividerText' />
                    </span>
                    <hr className='flex-1' />
                  </div>
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

export default MagicLink
