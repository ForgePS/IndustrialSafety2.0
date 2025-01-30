// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { Label } from '@repo/ui/components/ui/label'
import LeftSection from '@repo/ui/auth/LeftSection'
import TranslatedInput from '@repo/ui/components/ui/translated-input'

// SVG Imports
import Google from '@repo/ui/assets/svg/Google'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const LoginAdvanced = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen relative basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='pbs-8 is-full absolute'>
          <Link href='/' className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex items-center gap-2'>
            <TbChevronLeft className='is-[22px] bs-[22px] text-textSecondary' />
            <span className='text-textSecondary'>
              <Trans i18nKey='packages-ui:backToWebsiteButton' />
            </span>
          </Link>
        </div>
        <div className='plb-[7rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:loginTitle' values={{ appName }} />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:loginRegisterDescription' />
              </p>
            </div>
            <p className='text-textSecondary flex gap-x-1'>
              <span>
                <Trans i18nKey='packages-ui:loginWithText' />
              </span>
              <Link href='/auth/magic-link-v2' className='text-primary'>
                <Trans i18nKey='packages-ui:magicLinkTitle' />
              </Link>
            </p>
            <div className='flex flex-wrap gap-6 sm:flex-nowrap lg:flex-wrap xl:flex-nowrap'>
              <Button variant='outline' className='is-full'>
                <Trans i18nKey='packages-ui:loginAsUserButton' />
              </Button>
              <Button variant='outline' className='is-full'>
                <Trans i18nKey='packages-ui:loginAsAdminButton' />
              </Button>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='email'>
                  <Trans i18nKey='packages-ui:emailLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <TranslatedInput id='email' type='email' translationKey='packages-ui:emailPlaceholder' />
              </div>
              <div>
                <Label htmlFor='password'>
                  <Trans i18nKey='packages-ui:passwordLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <PasswordInput id='password' placeholder='················' />
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center'>
                  <Checkbox id='remember' />
                  <Label htmlFor='remember' className='mis-3 text-textSecondary text-base'>
                    <Trans i18nKey='packages-ui:loginRememberMe' />
                  </Label>
                </div>
                <Link href='/auth/forgot-password-v2' className='text-primary'>
                  <Trans i18nKey='packages-ui:forgotPasswordTitle' />
                </Link>
              </div>
              <Button>
                <Trans i18nKey='packages-ui:loginTitle' values={{ appName }} />
              </Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>
                  <Trans i18nKey='packages-ui:loginDontHaveAccount' />
                </span>
                <Link href='/auth/register-v2' className='text-primary'>
                  <Trans i18nKey='packages-ui:loginSignUp' />
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

export default LoginAdvanced
