// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbMail } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import LeftSection from '@repo/ui/auth/LeftSection'
import TranslatedInput from '@repo/ui/components/ui/translated-input'

// SVG Imports
import Google from '@repo/ui/assets/svg/Google'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const MagicLinkAdvanced = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='plb-[12rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:magicLinkTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:magicLinkDescription' />
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='email'>
                  <Trans i18nKey='packages-ui:emailLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <TranslatedInput id='email' type='email' translationKey='packages-ui:emailPlaceholder' />
              </div>
              <Button>
                <TbMail className='is-5 bs-5' />
                <span>
                  <Trans i18nKey='packages-ui:sendMagicLinkButton' />
                </span>
              </Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>
                  <Trans i18nKey='packages-ui:accessAccountWithText' />
                </span>
                <Link href='/auth/login-v2' className='text-primary'>
                  <Trans i18nKey='packages-ui:passwordLabel' />
                </Link>
              </p>
              <div className='flex items-center gap-4'>
                <hr className='flex-1' />
                <span className='text-textPrimary text-base'>
                  <Trans i18nKey='packages-ui:orText' />
                </span>
                <hr className='flex-1' />
              </div>
              <Button variant='ghost'>
                <Google className='text-xl' />
                <span className='text-textPrimary'>
                  <Trans i18nKey='packages-ui:signInWithGoogleButton' />
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MagicLinkAdvanced
