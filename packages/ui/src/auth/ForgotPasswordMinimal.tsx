// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Button } from '@repo/ui/components/ui/button'
import TranslatedInput from '@repo/ui/components/ui/translated-input'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const ForgotPasswordMinimal = async () => {
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
                <Trans i18nKey='packages-ui:forgotPasswordTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:forgotPasswordDescription' />
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
                <Trans i18nKey='packages-ui:sendResetLinkButton' />
              </Button>
              <Button variant='ghostPrimary' asChild>
                <Link href='/auth/login-v1' className='flex items-center gap-x-2'>
                  <TbChevronLeft className='is-[22px] bs-[22px]' />
                  <span>
                    <Trans i18nKey='packages-ui:backToLoginButton' />
                  </span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ForgotPasswordMinimal
