// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbChevronLeft } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import LeftSection from '@repo/ui/auth/LeftSection'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@repo/ui/components/ui/input-otp'

// Component Imports
import Logo from '@components/layout/front/Logo'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const ResetPasswordAdvanced = async () => {
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
        <div className='plb-[11rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>Two Factor Authentication</h1>
              <p className='text-textSecondary'>
                Please confirm access to your account by entering the code provided by your authentication application.
              </p>
            </div>
            <div className='flex items-center justify-between'>
              <p className='font-medium'>
                Code<span className='text-destructive'>*</span>
              </p>
              <Link href='' className='text-primary font-medium'>
                Use a recovery code
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
            <Button>{`Sign in to ${appName}`}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordAdvanced
