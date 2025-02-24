// Third-party Imports
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import TranslatedInput from '@repo/ui/components/ui/translated-input'
import Link from '@repo/ui/components/Link'

// SVG Imports
import Google from '@repo/ui/assets/svg/Google'

// Config Imports
import appConfig from '@configs/appConfig'

const LoginMinimal = async () => {
  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:loginTitle' values={{ appName: appConfig.appName }} />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:loginRegisterDescription' />
              </p>
            </div>
            <p className='text-textSecondary flex gap-x-1'>
              <span>
                <Trans i18nKey='packages-ui:loginWithText' />
              </span>
              <Link className='text-primary'>
                <Trans i18nKey='packages-ui:magicLinkTitle' />
              </Link>
            </p>
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
                  <Label htmlFor='remember' className='mis-2 text-textSecondary text-base'>
                    <Trans i18nKey='packages-ui:loginRememberMe' />
                  </Label>
                </div>
                <Link className='text-primary'>
                  <Trans i18nKey='packages-ui:forgotPasswordTitle' />
                </Link>
              </div>
              <Button>
                <Trans i18nKey='packages-ui:loginTitle' values={{ appName: appConfig.appName }} />
              </Button>
              <p className='flex flex-wrap items-center justify-center gap-1 text-base'>
                <span className='text-textSecondary'>
                  <Trans i18nKey='packages-ui:loginDontHaveAccount' />
                </span>
                <Link className='text-primary'>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default LoginMinimal
