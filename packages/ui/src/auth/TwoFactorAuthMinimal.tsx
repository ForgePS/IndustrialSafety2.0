// Third-party Imports
import Trans from '@repo/i18n/Trans'

// Component Imports
import Logo from '@components/layout/front/Logo'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@repo/ui/components/ui/input-otp'
import Link from '@repo/ui/components/Link'

// Config Imports
import appConfig from '@configs/appConfig'

const TwoFactorAuth = async () => {
  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>
                <Trans i18nKey='packages-ui:twoFactorAuthTitle' />
              </h1>
              <p className='text-textSecondary'>
                <Trans i18nKey='packages-ui:twoFactorAuthDescription' />
              </p>
            </div>
            <div className='flex items-center justify-between'>
              <p className='font-medium'>
                <Trans i18nKey='packages-ui:twoFactorAuthCodeLabel' />
                <span className='text-destructive'>*</span>
              </p>
              <Link className='text-primary font-medium'>
                <Trans i18nKey='packages-ui:twoFactorAuthRecoveryCodeLink' />
              </Link>
            </div>
            <InputOTP maxLength={6}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button>
              <Trans i18nKey='packages-ui:loginTitle' values={{ appName: appConfig.appName }} />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default TwoFactorAuth
