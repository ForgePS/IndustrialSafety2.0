// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'

// Component Imports
import Logo from '@components/layout/front/Logo'

import { Button } from '@repo/ui/components/ui/button'
import PasswordInput from '@repo/ui/components/ui/password-input'
import { Label } from '@repo/ui/components/ui/label'
import { Card, CardContent } from '@repo/ui/components/ui/card'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const ResetPasswordMinimal = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>Reset Password</h1>
              <p className='text-textSecondary'>
                Please enter your current password and choose a new password to update your account security.
              </p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='password'>
                  Password<sup className='text-destructive'>*</sup>
                </Label>
                <PasswordInput id='password' placeholder='················' />
              </div>
              <div>
                <Label htmlFor='confirm-password'>
                  Confirm Password<sup className='text-destructive'>*</sup>
                </Label>
                <PasswordInput id='confirm-password' placeholder='················' />
              </div>
              <Button>Set new password</Button>
              <Button variant='ghostPrimary' asChild>
                <Link href='/auth/login-v1' className='flex items-center gap-x-2'>
                  <TbChevronLeft className='is-[22px] bs-[22px]' />
                  <span>Go to Dashboard</span>
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
