// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'

// Component Imports
import Logo from '@components/layout/front/Logo'

import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const VerifyEmailMinimal = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className="bg-[url('/images/pages/background-v1.png')] bg-cover bg-center bg-no-repeat">
      <div className="min-bs-screen flex flex-col items-center justify-center bg-[url('/svg/auth-bg-shape.svg')] bg-center bg-no-repeat max-md:bg-none">
        <Card className='md:is-[430px] m-6 rounded-xl shadow-md'>
          <CardContent className='flex flex-col gap-6 !p-8'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>Verify your email</h1>
              <p className='text-textSecondary'>
                An activation link has been sent to your email address. Please check your inbox and click on the link to
                complete the activation process.
              </p>
            </div>
            <div className='flex flex-col gap-4 text-base'>
              <p className='text-textSecondary'>Didn&apos;t get the mail?</p>
              <Button>Resend Verification Email</Button>
              <Button variant='ghostPrimary' asChild>
                <Link href='/auth/login-v2' className='flex items-center gap-x-2'>
                  <TbChevronLeft className='is-[22px] bs-[22px]' />
                  <span>Back to Login</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default VerifyEmailMinimal
