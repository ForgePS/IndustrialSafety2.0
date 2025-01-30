// Next Imports
import Link from 'next/link'

// Third-party Imports
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import TranslatedInput from '@repo/ui/components/ui/translated-input'

// SVG Imports
import Google from '@repo/ui/assets/svg/Google'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const RegisterMinimal = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:registerTitle' values={{ appName }} />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:loginRegisterDescription' />
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='email'>
                  <Trans i18nKey='packages-ui:emailLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <TranslatedInput id='email' type='email' translationKey='packages-ui:emailPlaceholder' autoFocus />
              </div>
              <div>
                <Label htmlFor='password'>
                  <Trans i18nKey='packages-ui:passwordLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <PasswordInput id='password' placeholder='················' />
              </div>
              <div>
                <Label htmlFor='confirm-password'>
                  <Trans i18nKey='packages-ui:confirmPasswordLabel' />
                  <sup className='text-destructive'>*</sup>
                </Label>
                <PasswordInput id='confirm-password' placeholder='················' />
              </div>
              <Button>
                <Trans i18nKey='packages-ui:registerTitle' values={{ appName }} />
              </Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>
                  <Trans i18nKey='packages-ui:registerAlreadyHaveAccount' />
                </span>
                <Link href='/auth/login-v1' className='text-primary'>
                  <Trans i18nKey='packages-ui:registerSignIn' />
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default RegisterMinimal
