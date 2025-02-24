// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import Link from '@repo/ui/components/Link'

const ResetPasswordMinimal = async () => {
  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:resetPasswordTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:resetPasswordDescription' />
              </p>
            </div>
            <div className='flex flex-col gap-4'>
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
                <Trans i18nKey='packages-ui:resetPasswordButton' />
              </Button>
              <Button variant='ghostPrimary' asChild>
                <Link className='flex items-center gap-x-2'>
                  <TbChevronLeft className='is-[22px] bs-[22px]' />
                  <span>
                    <Trans i18nKey='packages-ui:goToDashboardButton' />
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

export default ResetPasswordMinimal
