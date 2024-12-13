// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'

// Component Imports
import Logo from '@components/layout/front/Logo'

import LeftSection from '@repo/ui/auth/LeftSection'
import { Button } from '@repo/ui/components/ui/button'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const VerifyEmailAdvanced = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen relative basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='pbs-8 is-full absolute'>
          <Link href='/' className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex items-center gap-2'>
            <TbChevronLeft className='is-[22px] bs-[22px] text-textSecondary' />
            <span className='text-textSecondary'>Back to the website</span>
          </Link>
        </div>
        <div className='plb-[20rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default VerifyEmailAdvanced
